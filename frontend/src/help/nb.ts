// Help texts (nb): every topic in topics.ts, with the same blocks as en.ts (help.test.ts checks it).
import type { TopicText } from "./types";

const texts: Record<string, TopicText> = {
  "start": {
    "title": "Kom i gang",
    "summary": "Hva Smooth Family er, hvordan appen er bygget opp og hvor du finner ting.",
    "blocks": [
      {
        "p": "Smooth Family er familiens egen app for kalenderen, listene, oppgavene, maten, hjemmet og smarthuset. Den kjører på en server hjemme hos dere – en NAS eller en liten datamaskin – så bildene, meldingene og planene deres blir hos dere. Ingenting sendes til store selskaper, og AI-en er lokal og bare på hvis dere vil."
      },
      {
        "shot": "today",
        "caption": "I dag samler dagen: kalenderen, oppgavene, været og mer."
      },
      {
        "h": "Installer den som en app"
      },
      {
        "steps": [
          "Åpne familiens adresse i telefonens nettleser og logg inn.",
          "iPhone: trykk Del → Legg til på Hjem-skjerm. Android: trykk ⋮ → Installer app (eller Legg til på startskjermen).",
          "Åpne Smooth Family fra startskjermen – den starter i fullskjerm og kan sende varsler."
        ]
      },
      {
        "h": "Finn frem"
      },
      {
        "p": "På telefonen ligger de mest brukte appene i linjen nederst og resten under Mer; på datamaskinen ligger de i menyen til venstre. Apper som hører sammen er faner øverst på siden – Kalender har Reiser, To hjem og Søndagsmøtet, Mat har Oppskriftsboken og Spiskammeret."
      },
      {
        "p": "Innstillingene finnes i tre nivåer, alle i menyen bak bildet ditt: Min profil (dine egne), Familieinnstillinger (for den som styrer familien) og Serverinnstillinger (for den som styrer serveren)."
      },
      {
        "tips": [
          "Spørsmålstegnet ved siden av en sides overskrift åpner hjelpen for den siden.",
          "Endre rekkefølgen i menyen, eller skjul apper du ikke bruker, under Min profil → Meny.",
          "Hvilke apper hver enkelt ser, velger familiens administrator under Familieinnstillinger → Familiemedlemmer."
        ]
      }
    ]
  },
  "signin": {
    "title": "Logge inn og være trygg",
    "summary": "Passord, passkeys med Face ID eller fingeravtrykk, og totrinnskoder.",
    "blocks": [
      {
        "p": "Du logger inn med brukernavn og passord. Voksnes passord har minst 12 tegn hvis ikke serverens administrator har valgt noe annet – det er lengden som gjør et passord vanskelig å knekke. Barn kan ha kortere."
      },
      {
        "h": "Passkeys – logg inn med ansiktet eller fingeren"
      },
      {
        "steps": [
          "Åpne Min profil → Sikkerhet og koblinger.",
          "Trykk Legg til passkey og følg telefonens eller datamaskinens anvisninger.",
          "Neste gang velger du Logg inn med passkey på innloggingssiden."
        ]
      },
      {
        "shot": "signin",
        "caption": "Passkeys og totrinnskoder under Min profil."
      },
      {
        "h": "Totrinnskoder"
      },
      {
        "p": "Med totrinnskoder skriver du en sekssifret kode fra en app som Microsoft eller Google Authenticator etter passordet. Serverens administrator kan gjøre dem påkrevd for voksne. De virker uten nett – ingen ekstern tjeneste er involvert."
      },
      {
        "tips": [
          "Glemt passordet? Spør familiens administrator, som setter et nytt under Familieinnstillinger → Familiemedlemmer.",
          "Mistet telefonen med kodene? Administratoren kan nullstille totrinnsinnloggingen din samme sted.",
          "En passkey hører til adressen den ble laget på; bytter familien adresse, lager du en ny."
        ]
      }
    ]
  },
  "notifications": {
    "title": "Varsler og morgensammendraget",
    "summary": "Klokken, varsler på telefonen og et sammendrag av dagen hver morgen.",
    "blocks": [
      {
        "p": "Alt som skjer for deg – en oppgave å godkjenne, en melding, en påminnelse, en medisindose – havner under klokken øverst. Tallet viser hvor mange du ikke har lest. De samme varslene kan også sendes til telefonen."
      },
      {
        "shot": "notifications",
        "caption": "Varselsenteret tar vare på alt, lest eller ikke."
      },
      {
        "h": "På telefonen"
      },
      {
        "steps": [
          "Åpne Min profil → Varsler.",
          "Slå på varsler for denne enheten og tillat dem når telefonen spør.",
          "Velg hva som skal sendes – resten havner likevel under klokken."
        ]
      },
      {
        "p": "Morgensammendraget er ett varsel til tiden du velger – hverdager eller hver dag – med dagens hendelser, dine oppgaver og medisiner, skolematen og været."
      },
      {
        "tips": [
          "iPhone: varsler virker bare når Smooth Family er lagt til på Hjem-skjermen.",
          "Hver enhet slås på for seg – telefonen og nettbrettet trenger det hver for seg."
        ]
      }
    ]
  },
  "offline": {
    "title": "Uten dekning",
    "summary": "Lister og oppgaver virker i en butikk uten mottak.",
    "blocks": [
      {
        "p": "Smooth Family tar vare på det du har åpnet, så appen virker når forbindelsen forsvinner. På handlelisten kan du krysse av, legge til og fjerne, og du kan krysse av oppgaver. Endringene vises med en gang og merkes med en liten sky til de er sendt."
      },
      {
        "p": "En markering øverst viser at du er frakoblet og hvor mange endringer som venter. Når forbindelsen kommer tilbake, sendes de av seg selv, i den rekkefølgen du gjorde dem."
      },
      {
        "tips": [
          "Andre sider viser det som sist ble lastet, men kan ikke endres før du er på nett igjen.",
          "Hvis noen andre har endret det samme i mellomtiden, gjelder den siste endringen."
        ]
      }
    ]
  },
  "today": {
    "title": "I dag",
    "summary": "Familiens dag på én side – med kortene du selv velger.",
    "blocks": [
      {
        "p": "I dag er første side. Den viser det som er viktig nå: ukens kalender, oppgavene dine, handlelisten, været, strømprisen, søppeltømmingen, skolematen, det i spiskammeret som bør spises snart, det som skjer for hjemmet og kjøretøyene, hvem som er hjemme – og mer."
      },
      {
        "shot": "today",
        "caption": "Hvert kort kan flyttes, legges til eller fjernes."
      },
      {
        "steps": [
          "Trykk Tilpass nederst på I dag.",
          "Legg til kort med Legg til widget, dra dem i den rekkefølgen du vil, eller fjern dem.",
          "Trykk Ferdig."
        ]
      },
      {
        "tips": [
          "Avganger: legg til et kort per holdeplass under Legg til widget – SL i Stockholm, eller en annen kilde for hele Sverige, Norge, Finland, Danmark eller London (noen trenger en nøkkel som serveradministratoren legger inn under Server → Adresse og tjenester).",
          "Kortenes kilder – stedet for været, søppeltømmingens kalender og skolen – stilles inn under Familieinnstillinger → Hverdagen.",
          "Et kort for en app du ikke kan bruke, vises ikke."
        ]
      }
    ]
  },
  "calendar": {
    "title": "Kalenderen",
    "summary": "Familiens kalender med skolens og lagenes, hvem som kjører og hva som skal pakkes.",
    "blocks": [
      {
        "p": "Kalenderen viser familiens egne hendelser sammen med kalendere dere abonnerer på – skolen, idrettslaget, jobben. Bytt mellom uken time for time, måneden og listen. Hendelser over flere dager er en stripe over dem, og ukenummeret står i kanten."
      },
      {
        "shot": "calendar",
        "caption": "Uken, time for time."
      },
      {
        "h": "Legg til en hendelse"
      },
      {
        "p": "Trykk + Ny hendelse, gi den en tittel og en tid, og velg hvem den gjelder – eller la den gjelde alle. Familiens hendelser deles med alle i familien."
      },
      {
        "h": "Hvem kjører, og hva skal pakkes"
      },
      {
        "p": "Trykk på Kjøring og pakking ved en hendelse – i kalenderen eller på søndagsmøtet – for å si at skyss trengs og ta levering eller henting – eller, med Noen andre, skrive hvem utenfor familien som kjører, for eksempel en lagkamerats forelder. Gi den en pakkeliste: den samme listen kommer tilbake for hver hendelse med samme tittel, som hver fotballtrening, og krysses av for hver gang. En voksen kan velge dagen det er tid for å pakke, og den som skal dit, får en oppgave den dagen."
      },
      {
        "shot": "calendar-month",
        "caption": "Måneden skriver ut hva som skjer hver dag."
      },
      {
        "h": "Abonner på en kalender"
      },
      {
        "p": "Kalendere leses via en privat iCal-lenke. Slik finner du lenken i de vanligste tjenestene:"
      },
      {
        "details": [
          {
            "title": "Google Kalender (Gmail)",
            "blocks": [
              {
                "steps": [
                  "Åpne calendar.google.com på en datamaskin – lenken finnes ikke i mobilappen.",
                  "I venstre kolonne under \"Mine kalendere\": hold musepekeren over kalenderen og klikk ⋮ → \"Innstillinger og deling\".",
                  "Rull ned til \"Integrer kalenderen\".",
                  "Kopier \"Hemmelig adresse i iCal-format\" (slutter på .ics). Ikke bruk \"Offentlig adresse\" – den fungerer bare hvis kalenderen er offentlig."
                ]
              },
              {
                "note": "Jobb- eller skolekontoer: administratoren kan ha slått av den hemmelige adressen. Mangler den, spør dem eller bruk en privat konto."
              }
            ]
          },
          {
            "title": "Outlook / Microsoft 365",
            "blocks": [
              {
                "steps": [
                  "Åpne outlook.com (privat konto) eller outlook.office.com (jobb/skole) i nettleseren.",
                  "Klikk tannhjulet (Innstillinger) → Kalender → Delte kalendere.",
                  "Under \"Publiser en kalender\": velg kalenderen og \"Kan vise alle detaljer\", og klikk Publiser.",
                  "Kopier ICS-lenken – ikke HTML-lenken."
                ]
              },
              {
                "note": "Klassisk Outlook for Windows kan ikke publisere kalendere – bruk Outlook på nettet eller nye Outlook. I jobbkontoer kan administratoren ha sperret publisering."
              }
            ]
          },
          {
            "title": "iCloud (iPhone / Mac)",
            "blocks": [
              {
                "steps": [
                  "Åpne Kalender-appen på iPhone og trykk \"Kalendere\" nederst.",
                  "Trykk (i) ved siden av kalenderen du vil legge til.",
                  "Slå på \"Offentlig kalender\" og trykk \"Del lenke…\" → Kopier.",
                  "Lenken starter med webcal:// – lim den inn som den er."
                ]
              },
              {
                "note": "\"Offentlig\" betyr at alle som har lenken kan lese kalenderen. Den er ikke oppført noe sted, men hold lenken privat."
              }
            ]
          },
          {
            "title": "SportAdmin (klubb- og lagaktiviteter)",
            "blocks": [
              {
                "steps": [
                  "Åpne SportAdmin-appen og gå til \"Aktiviteter\".",
                  "Trykk på kalenderikonet øverst til høyre.",
                  "Velg å kopiere lenken (abonner direkte legger bare kalenderen til i telefonen din).",
                  "Lim inn lenken i Smooth Family. Den starter som regel med webcal://cal.sportadmin.se/."
                ]
              },
              {
                "note": "Vises ingen aktiviteter? Laget må være koblet til klubbens kalender i SportAdmin – spør lagleder. Mange klubbsider har også en \"Abonner\"-knapp på kalendersiden: høyreklikk og kopier lenkeadressen. Legg til ett abonnement per lag og gi hvert sin egen farge."
              }
            ]
          },
          {
            "title": "MyClub (klubbens og lagets kalender)",
            "blocks": [
              {
                "steps": [
                  "Åpne klubbens nettsted på MyClub (klubbnavn.myclub.se) og gå til lagets kalender, eller siden om å abonnere på kalenderen.",
                  "Kopier abonnementslenken. Et lags ser ut som webcal://calendar.myclub.se/public/teams/12345/calendar.ics – hele klubbens har /public/clubs/ i stedet.",
                  "Lim inn lenken i Smooth Family."
                ]
              },
              {
                "note": "Finner du ikke lenken? Be laglederen om kalenderens abonnementslenke – det er den samme klubben gir for iPhone og Google. Legg til ett abonnement per lag, gi hvert sin egen farge og velg barnet det gjelder."
              }
            ]
          },
          {
            "title": "laget.se (klubbens og lagets kalender)",
            "blocks": [
              {
                "steps": [
                  "Åpne lagets side på laget.se, for eksempel laget.se/Lagnavn.",
                  "Gå til Kalender og klikk på Prenumerera (abonner) under kalenderen.",
                  "Kopier lenken. Den ser ut som webcal://cal.laget.se/Lagnavn.ics – samme navn som i lagets laget.se-adresse.",
                  "Lim inn lenken i Smooth Family."
                ]
              },
              {
                "note": "Kalenderen fra laget.se viser én måned bakover og seks måneder fremover. Legg til ett abonnement per lag, gi hvert sin egen farge og velg barnet det gjelder."
              }
            ]
          },
          {
            "title": "Legg til lenken i Smooth Family",
            "blocks": [
              {
                "steps": [
                  "Åpne profilmenyen (øverst til høyre) → Familieinnstillinger → Kalenderabonnementer.",
                  "Skriv et navn alle kjenner igjen, f.eks. \"Skolen\" eller \"Edvin – fotball\".",
                  "Lim inn lenken og velg en farge.",
                  "Klikk Legg til. Hendelsene vises i kalenderen og på I dag-siden."
                ]
              }
            ]
          },
          {
            "title": "Fungerer noe ikke?",
            "blocks": [
              {
                "tips": [
                  "Nye hendelser kan ta opptil 15 minutter å dukke opp – kalenderne mellomlagres så tjenestene ikke overbelastes.",
                  "Feil når du legger til? Sjekk at lenken starter med https:// eller webcal:// og at du kopierte iCal/ICS-lenken, ikke en lenke til en nettside.",
                  "Har en lenke lekket? Lag en ny hos leverandøren (Google: \"Tilbakestill\" den hemmelige adressen) og bytt den ut her."
                ]
              }
            ]
          }
        ]
      },
      {
        "tips": [
          "Kalendere dere abonnerer på kan bare leses og oppdateres hvert 15. minutt.",
          "Din egen kalender kan legges inn på telefonen med abonnementslenken under Min profil."
        ]
      },
      {
        "h": "Røde dager"
      },
      {
        "p": "Landets helligdager vises i kalenderen som røde dager, og aftenene som fungerer som helligdager (julaften, nyttårsaften …) i en lysere rød. Velg land – eller slå av – under Familieinnstillinger → Hverdagen. For et annet land legger du til en offentlig helligdagskalender som abonnement."
      }
    ]
  },
  "trips": {
    "title": "Reiser",
    "summary": "Planlegg reisen sammen: datoer, reiseplan, pakking per person og et budsjett.",
    "blocks": [
      {
        "p": "En reise har datoer og reisemål – den vises i kalenderen – og hvem som skal. Legg til reiseplanen med reiser, overnattinger og aktiviteter (billetter kan lenkes fra hvelvet), et felles budsjett og en sjekkliste før avreise, som å skru av vannet."
      },
      {
        "shot": "trips",
        "caption": "Pakking per reisende, med ferdige lister."
      },
      {
        "h": "Pakking"
      },
      {
        "p": "Hver reisende har sin egen pakkeliste, pluss en felles. Start fra en mal – strand, ski eller helg – og legg til resten. En voksen kan velge dagen det er tid for å pakke: hver reisende får da en oppgave den dagen, med poeng, og en lenke til sin egen liste."
      },
      {
        "tips": [
          "Kvelden før avreise påminnes alle som skal, om det som gjenstår å pakke og sjekke.",
          "Barna ser og pakker sine egne ting; de voksne planlegger resten."
        ]
      }
    ]
  },
  "parties": {
    "title": "Selskap",
    "summary": "Planlegg et selskap sammen – én invitasjonsside for gjestene, og sjekklisten, budsjettet og tidsplanen for dere.",
    "blocks": [
      {
        "p": "Under Kalender → Fest planlegger du en barnebursdag, en fest, en middag, en kampkveld, en grillkveld eller en dag utendørs. Gjestene får én felles side – uten konto – først en sett av datoen om dere vil, så invitasjonen der de svarer med navn, allergier og hvem de tar med så langt dere tillater, på dagen portalen for bildene deres, og etterpå takken. De kan endre svaret senere. Dere velger hva de ser av hverandre: ingenting, hvor mange som kommer eller navnene."
      },
      {
        "shot": "parties",
        "caption": "Festens åtte trinn – her Design, som begynner med malene."
      },
      {
        "steps": [
          "Kalender → Fest → Ny fest: navnet, typen, hvem festen er for, tiden og stedet – så tar festen deg gjennom sju trinn.",
          "1 Detaljer · 2 Design: maler og utseende (tema og bilde), sett av datoen, invitasjonen, festportalen og takken, hver med sin egen plakat · 3 Gjester: hvem som kommer, allergier, e-postadresser – og deres egen liste over inviterte.",
          "4 Gjøremål – før, under og etter festen · 5 Budsjett · 6 Program, med punkter dere kan skjule for gjestene · 7 Utsendelser: e-post til sin tid (med serverens e-post), eller lenkene å dele selv."
        ]
      },
      {
        "shot": "partyinvite",
        "caption": "Gjestenes invitasjon: plakaten i festens tema, detaljene, kalenderknappene og svaret."
      },
      {
        "h": "Planleggingen"
      },
      {
        "p": "En ny fest starter med en sjekkliste for sin type – før, under og etter festen – med datoer; hver morgen noe skal gjøres, blir de voksne påminnet. Endre den som dere vil. Budsjettet holder oversikt over hva som er brukt mot det planlagte, og programmet over dagens tider (en barnebursdag starter med ett) – et punkt kan skjules for gjestene i portalen."
      },
      {
        "shot": "partyportal",
        "caption": "Festportalen via QR-koden: gjestenes bilder, dagens program og mer."
      },
      {
        "tips": [
          "En fest kan ha to chatter, som velges under Detaljer. Gjestechatten er på sidene deres og i portalen, der de skriver til hverandre og dere før og under festen, og også i chat-appen deres. Planleggingschatten er for familiens voksne og hjelperne, og de planen holdes hemmelig for, er ikke med.",
          "E-postene er HTML i festens tema, med gjestens egen knapp, og vanlig tekst til programmer som vil ha det. Spar datoen sendes ikke på e-post, siden du ikke har adressene ennå: under Utsendelser får du en ferdig melding med lenken, som kan deles med sms, WhatsApp, e-post eller en app. De som melder seg på, legger igjen adressen og får invitasjonen på e-post.",
          "Under Gjester kan dere koble sammen gjester, for eksempel et par som begge har registrert seg. Begge beholder sitt eget svar og sin lenke, men ingen telles dobbelt, de kan ikke ta med enda en +1, de havner ved samme bord, og den ene kan svare for den andre. Appen sier fra når noens +1 allerede står på listen, og viser hvor mange som høyst kan komme.",
          "Ta inn en toastmaster: under Detaljer gir Eksterne hjelpere noen en personlig lenke, uten konto, som slutter å gjelde 1 dag, 3 dager eller 1 uke etter festen. De kan gjøre alt for festen unntatt å fjerne den, og ser ingenting annet av familiens. Et nytt trinn, Planlegging, har taler, servering, leker og notater etter klokken, og de velger hvem det holdes hemmelig for: for dem er det gråtonet.",
          "Innsjekk er en valgfri side: fra sin tid viser gjestenes lenke nedtelling, at de er påmeldt, informasjonen deres og tommel opp eller ned. Tommel ned, med en valgfri melding, endrer svaret, og dere får vite det med en gang. En QR-kode som skannes før portalen åpner, fører til en venteside.",
          "Under Utsendelser viser E-postene hva hver e-post sier. Endre teksten, se hvordan det ser ut og planlegg når den går.",
          "Under Detaljer finnes også maten, der gjestene velger med svaret, påmelding til tale og praktisk info. Under Budsjett samler dere leverandører, via serverens søk eller for hånd, og den dere velger, havner i budsjettet. Hver oppgave kan ha en ansvarlig, som får påminnelsen. Det finnes kjøreplan, bordliste og bordkort å skrive ut.",
          "Velg festens sider under Detaljer: invitasjonen med svar er alltid med, spar datoen, festportalen og takken velger dere selv. Det som ikke er valgt, vises ikke under Design eller Utsendelser, og gjestenes lenke hopper over det.",
          "Importer gjesteliste under Gjester: Excel (.xlsx), CSV, en tekstfil eller innlimte navn. Alle blir invitert med sin egen lenke. Der finnes også bordplasseringen: legg til bordene og velg bord for hver gjest; følget sitter sammen og plassene telles.",
          "Skriv {gjest} i en tekst på plakaten, så ser en gjest med personlig lenke sitt eget fornavn. En tekst med feltet vises ikke for dem uten navn, så det passer til en hilsen: invitasjonen og takken begynner med en.",
          "Portalen ligger under Utsendelser: når den åpnes og når QR-koden og lenken slutter å gjelde – 3 timer etter festen om dere ikke endrer, så ingen kommer inn morgenen etter. Å skrive ut QR-koden er en oppgave under Å gjøre, på en side i festens tema. Slå på bakgrunnsgrafikk i nettleserens utskriftsvindu for å få med fargene.",
          "Hver side har Forhåndsvis som gjest under Design, for datamaskin og mobil. Siste trinn, Festen, gir en siste sjekkliste over hva som gjenstår – så er det bare å ha det gøy!",
          "Under Gjester kopierer lenkeknappen ved hver gjest den personlige lenken til gjesten og følget, til å sende med sms eller hvordan dere vil. Den som har lenken, kan svare som gjesten, så send den bare til dem.",
          "Hver plakat kan se ulik ut på datamaskin og mobil: velg Mobil i plakateditoren, så gjelder rekkefølgen, det som vises, justeringen og størrelsen du endrer, bare på mobil. Tekster og bilder deles, så en retting vises på begge. Til du endrer noe, følger mobilen datamaskinen. Brede nettbrett regnes som datamaskin, smale som mobil.",
          "Maler (Design → Maler) setter alle plakatene og utseendet på én gang: den innebygde Gala eller deres egne – lagre hvilken som helst fest som mal. Eller lag en med egen AI: skriv ønskene, kopier prompten til valgfri AI og lim inn svaret. Dere ser malen før den brukes, bare det plakatene kjenner til kommer inn (ingen kode, ingen bilder utenfra), og alt kan endres etterpå. En mal kan også lagres som fil og åpnes av en annen familie.",
          "Én lenke hele veien: på spar datoen registrerer gjestene seg med navn og e-post. Invitasjonsmailen gir hver av dem en personlig lenke å svare med. Åpner de den igjen, ser de svaret sitt og kan endre det. Den som ikke har svart, får en påminnelse av seg selv før siste svardag (Utsendelser). Fra tiden dere setter under Design åpner samme lenke festportalen, og på tiden dere setter under Takk går takken ut til dem som kom.",
          "Én fest, fire sider i samme tema, hver med sin egen plakat (Plakat): først en sett av datoen om dere vil – gjestene lagrer datoen og legger igjen e-posten, og får en e-post når dere bytter lenken til invitasjonen – så invitasjonen, festportalen og takken. Lim inn en samarbeidsliste i Spotify, så kan gjestene ønske seg sanger. Åpne festportalen og skriv ut QR-koden til bordene: gjestene laster opp bildene sine rett til et album i hvelvet og ser dagens program.",
          "Appen har et bildebibliotek: bakgrunner og toppbilder til mange av temaene, og klistremerker – ballonger, discokule, kreps, russelue, ringer, gresskar med mer – å sette på plakaten i stedet for emoji (Plakat → en dekorasjonsrad eller emblemet → Bibliotek).",
          "Under Plakat gjør dere invitasjonssiden til deres egen: legg til, flytt og fjern delene (tekster, bilder, et emblem, en dekorasjonsrad, når og hvor som billett, kort, liste eller stor dato, en nedtelling, kalenderknapper, invitasjonen, et bånd). Skriv hver tekst med egen skrift, størrelse, justering og farge – {navn}, {dato} og lignende fylles inn av seg selv. Bytt emojiene mot andre eller mot egne bilder, og velg hvilke kalenderknapper gjestene får: kalenderfil (den åpner Apples Kalender på iPhone og Mac, og de fleste andre), Google eller Outlook. Temaets plakat er alltid ett trykk unna.",
          "Ingen bestemt dato ennå: kryss av for La gjestene stemme over datoen, og legg til datoene som passer dere. Gjestene krysser av for dem som passer dem; under Invitasjon ser dere hvor mange hver dato passer for, og velger én – da havner festen i kalenderen, de som stemte på den regnes som at de kommer, og de som har bedt om oppdateringer får en e-post.",
          "Velg hva hver gjest kan ta med: ingen, en +1 eller familien – da legger de til alle i følget, hver med allergier og om det er et barn. En middag, en grillkveld eller en utendørsaktivitet starter med familien.",
          "Velg festens tema, som alle sidene deler – de som passer festen først (ballonger, pirater og dinosaurer for barnebursdag; disco, glitter, 80-tallet og champagne for fest; bistro, jul og krepsefest for middag; fotball og hockey for kamp; grill, slåball og strand utendørs). Eller lag et eget: farger, mønster, emoji og egne bilder øverst og i bakgrunnen – lagret til senere. Et eget bilde kan også ligge på invitasjonen.",
          "Gjester som oppgir e-post og ber om oppdateringer, får en bekreftelse, en e-post hvis tid eller sted endres, en påminnelse dagen før og takken – og meldingene dere sender under Gjester. Det krever serverens e-post, som serveradministratoren setter opp under Server → Adresse og tjenester.",
          "Festen legges i kalenderen av seg selv – for alle den gjelder (kryss av for én eller flere i familien), og dere velger hvem sin ønskeliste som vises på invitasjonen.",
          "Vis ønskelisten: gjestene ser ønskene til den selskapet gjelder og krysser av det de kjøper; den det gjelder ser aldri hvem.",
          "Etterpå, under Takk: en takketekst og bildene fra et album i Hvelvet, på samme side som gjestene allerede har.",
          "Bare de voksne planlegger selskap – ønskelistens reservasjoner ligger i planleggingen."
        ]
      }
    ]
  },
  "school": {
    "title": "Skolen",
    "summary": "Barnas skoledag fra InfoMentor eller SchoolSoft via Home Assistant: skolekortet, skolens kalendere og ukebrevet.",
    "blocks": [
      {
        "p": "Hvis familien har koblet til Home Assistant, kan barnas skole komme inn i Smooth Family via fellesskapets integrasjoner for InfoMentor og SchoolSoft. Skolekortet på I dag viser hvert barns skoledag, gym neste skoledag, SFO-tidene, lekser, fravær og hva som skjer videre – og ukebrevet, som åpnes rett der. Skolens kalendere – timeplanen, prøver og turer, SFO – kommer inn i kalenderen som barnets."
      },
      {
        "details": [
          {
            "title": "InfoMentor (anbefales)",
            "blocks": [
              {
                "steps": [
                  "I Home Assistant: åpne HACS → ⋮ → Egendefinerte repositorier, legg til https://github.com/c14ym0re/infomentor-homeassistant av typen Integration og installer InfoMentor.",
                  "Start Home Assistant på nytt.",
                  "Innstillinger → Enheter og tjenester → Legg til integrasjon → InfoMentor. Logg inn med BankID (skann QR-koden – foreløpig bare for Stockholm stad) eller med e-post og passord hvis kommunen fortsatt har den klassiske InfoMentor-kontoen.",
                  "Hvert barn blir en enhet. I Smooth Family krysser du av barnet under Familiemedlemmer → barnet → Skolen fra Home Assistant."
                ]
              },
              {
                "note": "Den gir skoledagen, gym, lekser, ukebrevet, fravær, SFO-tidene, skolens kalender og skolens nyheter – og lunsjen hvis du oppgir skolens Mateo-enhet. En annen integrasjon, https://github.com/chrfo892/ha-infomentor, gir timeplanen, innsjekking på SFO og uleste varsler; den installeres på samme måte."
              }
            ]
          },
          {
            "title": "SchoolSoft (timeplan og oppmøte)",
            "blocks": [
              {
                "steps": [
                  "I HACS → ⋮ → Egendefinerte repositorier: legg til https://github.com/chriseckl/Schoolsoft-for-Home-Assistant av typen Integration, installer den og start Home Assistant på nytt.",
                  "Innstillinger → Enheter og tjenester → Legg til integrasjon → SchoolSoft, og logg inn med foresattes brukernavn og passord.",
                  "Legg den til én gang per barn, og kryss så av hvert barns konto i Smooth Family."
                ]
              },
              {
                "note": "Den gir timeplanen som kalender (timer merket fraværende eller sen), nåværende og neste time samt dagens start og slutt. For lunsjmenyen finnes https://github.com/kanylbullen/ha-schoolsoft – skolens navn er det i skolens SchoolSoft-adresse."
              }
            ]
          }
        ]
      },
      {
        "p": "Et nytt ukebrev, fravær i dag og nyheter fra skolen sendes til barnets voksne som varsler. Barnets skole vises for barnets voksne og for barnet selv; kjøkkenskjermen viser bare skoledagen, aldri fravær eller brev."
      },
      {
        "tips": [
          "Legg til kortet Skolen på I dag under Tilpass – og Skoledagen på kjøkkenskjermen under Familieinnstillinger → Kjøkkenskjerm om dere vil.",
          "Beta: integrasjonene er små, uoffisielle prosjekter, og sensorene deres gjenkjennes på navnene (på engelsk eller svensk). Mangler noe – fortell oss hvilke sensorer integrasjonen deres har.",
          "En skolekalender kan også legges til for hånd under kalenderinnstillingene med adressen homeassistant://calendar.navn.",
          "Kalendere fra Home Assistant krever direkte tilkobling – de kan ikke leses via gatewayen."
        ]
      }
    ]
  },
  "health": {
    "title": "Helse",
    "summary": "Treningen din og dagens skritt, søvn og vekt – privat eller delt med familien.",
    "blocks": [
      {
        "p": "Logg en treningsøkt med noen trykk – type, minutter og distanse om du vil – og dagens skritt, søvn og vekt. Siden din viser de siste fire ukene: minutter per dag, øktene dine og hvor mange dager på rad du har vært i bevegelse."
      },
      {
        "h": "Hvem ser det"
      },
      {
        "p": "Alt er bare ditt til du deler det, type for type: trening, skritt, søvn og vekt, hver med bare deg, de voksne eller hele familien. Andre ser det du deler i ukens oversikt øverst."
      },
      {
        "steps": [
          "Åpne Helse i menyen.",
          "Logg en økt eller dagens verdier.",
          "Under Hvem ser helsen din velger du hva du deler og med hvem."
        ]
      },
      {
        "h": "Sammen"
      },
      {
        "p": "En voksen setter familiens mål – timer, kilometer eller økter mellom to datoer, for eksempel 500 km sammen i mai. De teller treningen hver enkelt deler med familien og vises i Helse, i søndagsmøtet og på kjøkkenskjermen (ukens bevegelse). En oppgave kan bli ferdig ved trening: velg minst så mange minutter den dagen, så krysses den av av seg selv når personens trening holder – med poeng, som enhver oppgave. Trening gir også utmerkelser."
      },
      {
        "tips": [
          "De voksne ser alltid et barns helse og kan fylle den ut – en forelder kan logge fotballtreningen.",
          "Et barns vekt lagres ikke, og vekt sammenlignes aldri: den er ikke i oversikten.",
          "Last ned dine egne data som en fil, eller fjern alt, nederst på siden din."
        ]
      },
      {
        "h": "Fra Home Assistant"
      },
      {
        "p": "Hvis familien har koblet til Home Assistant, kan skritt, søvn, vekt og hvilepuls hentes fra hver enkelts egne kontoer der: telefonen med følgeappen, en bruker i Withings, Google Health, Garmin og flere. En familieadmin kobler kontoene under Familieinnstillinger → Familiemedlemmer → personen; personen slår så på Hent helsen min fra Home Assistant i profilen sin – ingenting hentes før det. For et barn slår en voksen det på på barnets side. De leses hvert 15. minutt og når du trykker Hent nå, og lagres på dagen de gjelder; det du fyller inn selv på en dag vinner alltid, og et barns vekt leses aldri."
      },
      {
        "tips": [
          "Én konto per person i Home Assistant: legg til integrasjonen for Withings, Garmin eller Google Health én gang for hver av dere, med egen innlogging – og følgeappen på hver telefon.",
          "Skritt og søvn fra telefonen: installer Home Assistants følgeapp og slå på sensorene – på Android de for Health Connect (skritt, søvn, puls, vekt …), på iPhone skrittelleren (skritt).",
          "En vekt eller en klokke: Withings har en egen integrasjon i Home Assistant; Garmin, Fitbit, Oura og flere finnes som integrasjoner fra fellesskapet (HACS).",
          "Treningsøkter (beta): fra Withings' treningskalender eller en integrasjons sensor for siste aktiviteter, som Garmin Connect eller Strava – de siste to ukene, hver økt én gang, også om den allerede er logget her for hånd."
        ]
      }
    ]
  },
  "twohomes": {
    "title": "To hjem",
    "summary": "For barn som bor hos begge foreldrene: timeplanen, overleveringer og den andre forelderen.",
    "blocks": [
      {
        "p": "Still inn hvilke dager et barn er i hvilket hjem – annenhver uke, 2-2-3, annenhver helg eller egne dager – og legg til unntak for ferier og byttede helger. Kalenderen viser dagene, og barnets oppgaver venter mens barnet er i det andre hjemmet."
      },
      {
        "shot": "twohomes",
        "caption": "Timeplanen mellom hjemmene."
      },
      {
        "steps": [
          "Åpne Familieinnstillinger → Familiemedlemmer → barnet.",
          "Velg barnet, mønsteret og første dag.",
          "Legg til unntak når planene endres."
        ]
      },
      {
        "h": "Den andre forelderen"
      },
      {
        "p": "Den andre forelderen kan få en egen konto som bare ser sitt barn: timeplanen, kalenderen, nødkortet og overleveringslisten – og kan skrive med dere. Eller send en lenke som viser det samme uten konto. Kostnader for barnets ting kan deles, så den andre ser beløpet og sin del – aldri bilder eller notater."
      },
      {
        "tips": [
          "Kvelden før en overlevering påminnes de voksne, med overleveringslisten.",
          "Fanen To hjem vises i kalenderen når en timeplan er satt opp."
        ]
      }
    ]
  },
  "week": {
    "title": "Søndagsmøtet",
    "summary": "En rolig stund hver uke: se tilbake, se fremover og si takk.",
    "blocks": [
      {
        "p": "Søndagsmøtet samler familien én gang i uken. Se tilbake på poengene og ukens beste hjelper, se fremover på kalenderen, maten og hvem sin tur det er – og gi hverandre takkestjerner."
      },
      {
        "shot": "week",
        "caption": "Uken som gikk og uken som kommer."
      },
      {
        "p": "Velg noe å gjøre sammen og merk sjekken som ferdig: alle får et kort sammendrag. Søndag ettermiddag blir dere påminnet hvis dere ikke har gjort den."
      },
      {
        "h": "Planlegg uken som kommer"
      },
      {
        "p": "Under uken som kommer trykker du på Kjøring og pakking ved en hendelse for å ta en levering eller henting og gi den en pakkeliste. Skriv inn en dags middag direkte – navnet på en oppskrift tar med ingrediensene til handlelisten – eller planlegg hele ukens mat derfra."
      }
    ]
  },
  "chat": {
    "title": "Chatten",
    "summary": "Familiens egen chat – med bilder, og bare for dere.",
    "blocks": [
      {
        "p": "Skriv med hele familien eller med én eller noen få. Bilder havner i chattens eget album i hvelvet. Meldingene lagres på serveren deres – ingen andre leser dem."
      },
      {
        "shot": "chat",
        "caption": "Meldinger gruppert per person, med store emojier."
      },
      {
        "tips": [
          "GIF-er kan slås på av serverens administrator; de kommer fra GIPHY, det eneste stedet chatten når utenfor.",
          "Uleste meldinger vises som et tall på chatten og som et kort på I dag."
        ]
      }
    ]
  },
  "lists": {
    "title": "Lister",
    "summary": "Handlelister og gjøremålslister som oppdateres for alle med en gang.",
    "blocks": [
      {
        "p": "Lag så mange lister dere trenger – maten, byggvarehuset, pakkingen. Alle ser kryss og nye ting med en gang, og listene virker uten dekning. Gi en liste nytt navn med blyanten ved siden av navnet."
      },
      {
        "shot": "lists",
        "caption": "En handleliste, delt og levende."
      },
      {
        "tips": [
          "Kjøpte varer kan legges rett i spiskammeret med Legg kjøpte varer i spiskammeret.",
          "En liste kan sendes til Home Assistant, og derfra til butikkens app – se Handlelister i Home Assistant.",
          "Ønskelister og gaveplanlegging er også lister – se Ønskelister og gaver."
        ]
      }
    ]
  },
  "wishes": {
    "title": "Ønskelister og gaver",
    "summary": "Alles ønskelister, hemmelig gaveplanlegging og en lenke til besteforeldrene.",
    "blocks": [
      {
        "p": "Alle i familien har en ønskeliste. Legg til et ønske med lenke og pris – eller søk det opp på nettet. De andre planlegger gaver i hemmelighet: bursdagsbarnet ser aldri hvem som kjøper hva."
      },
      {
        "shot": "wishes",
        "caption": "En ønskeliste med lenker."
      },
      {
        "h": "Del med slekten"
      },
      {
        "p": "Send en lenke til besteforeldre og andre uten konto. De ser ønskelisten og kan merke hva de kjøper, så ingenting kjøpes to ganger – uten at barnet ser det."
      },
      {
        "tips": [
          "Seks uker før en bursdag påminnes bursdagsbarnet om å fylle ut listen sin, og en måned før påminnes de andre om å planlegge.",
          "Fødselsdager: et medlems på medlemmets side under Familiemedlemmer; slekt og venner under Familiemedlemmer → Andre personer."
        ]
      }
    ]
  },
  "food": {
    "title": "Maten og middagsplanen",
    "summary": "Ukens middager, oppskrifter fra en lenke og matlagingsmodus.",
    "blocks": [
      {
        "p": "Planlegg ukens middager under Mat. Hent en oppskrift fra en lenke – de fleste oppskriftssider virker – eller lim inn teksten hvis en side ikke lar seg lese. Ingrediensene kan legges rett på handlelisten."
      },
      {
        "shot": "food",
        "caption": "Ukens middager."
      },
      {
        "h": "Matlagingsmodus"
      },
      {
        "p": "Trykk Lag på en oppskrift for stor tekst, ingredienser å krysse av og trinn å trykke seg gjennom. Hold skjermen på hindrer telefonen i å slukke mens hendene er skitne."
      },
      {
        "h": "Matpakker og helgelunsj"
      },
      {
        "p": "Når du planlegger uken, kan du krysse av for Matpakker på hverdager og velge hvor mange per dag: middagen kvelden før blir da en stor porsjon – en gryte, en suppe eller en ovnsrett som holder seg og kan varmes – og restene blir neste dags matpakker. Kryss av for Lunsj lørdag og søndag for helgens lunsjer også. Valget huskes til neste uke."
      },
      {
        "tips": [
          "Med den lokale AI-en kan ukens middager foreslås for dere – ut fra det dere liker og det dere har hjemme.",
          "Når middagen er ferdig, krysser du av hva som gikk med, og spiskammeret teller ned av seg selv."
        ]
      }
    ]
  },
  "recipebook": {
    "title": "Oppskriftsboken",
    "summary": "Familiens oppskrifter med kategorier, favoritter og stjerner fra alle.",
    "blocks": [
      {
        "p": "Oppskriftsboken tar vare på familiens oppskrifter med kategorier, favoritter og lenke til originalen. Alle i familien gir sine egne stjerner – barna også – så dere ser hva som er populært."
      },
      {
        "shot": "recipebook",
        "caption": "Oppskrifter med alles stjerner."
      },
      {
        "p": "Kan lages nå viser det som kan lages av det dere har i spiskammeret. Søk nye oppskrifter på nettet via serverens egen søkemotor – bare søkeordene forlater serveren."
      }
    ]
  },
  "pantry": {
    "title": "Spiskammeret",
    "summary": "Det dere har i fryseren, kjøleskapet og spiskammeret – og det som bør spises snart.",
    "blocks": [
      {
        "p": "Hold oversikt over hva dere har, hvor og til når. Det som snart går ut, merkes og vises på I dag, så mindre mat kastes."
      },
      {
        "shot": "pantry",
        "caption": "Best før, per sted."
      },
      {
        "h": "Skann inn maten"
      },
      {
        "steps": [
          "Trykk Skann inn varer og hold varene opp mot kameraet én om gangen – den samme varen igjen telles opp.",
          "Sjekk navn og mengder.",
          "Legg alt på riktig sted på én gang."
        ]
      },
      {
        "tips": [
          "Oppslag av strekkoder kan slås på under Familieinnstillinger → Koblinger; bare strekkoden sendes.",
          "En kvittering som den lokale AI-en har lest, kan også fylle spiskammeret."
        ]
      }
    ]
  },
  "tasks": {
    "title": "Oppgaver og poeng",
    "summary": "Gjøremål med poeng, rotasjon, godkjenning – og etterrapportering.",
    "blocks": [
      {
        "p": "Oppgaver kan være engangs eller gjentas hver dag, på valgte ukedager, hver måned eller hvert år. Hver oppgave er verdt poeng. Trykk Ferdig når den er gjort – barnas oppgaver kan vente på at en voksen godkjenner dem."
      },
      {
        "shot": "tasks",
        "caption": "Dagens oppgaver med poeng."
      },
      {
        "h": "Gå på omgang"
      },
      {
        "p": "Velg hvem som går på omgang med en oppgave: turen går videre når den er gjort, eller hver uke. Listen viser hvem som står for tur."
      },
      {
        "h": "Glemt å krysse av?"
      },
      {
        "p": "Under Oppgaver → I dag går du bakover med pilen – opptil tre dager – og krysser av det som ble gjort, med poeng som vanlig."
      },
      {
        "h": "Krysset av feil?"
      },
      {
        "p": "Trykk på haken ved en ferdig oppgave for å angre – poengene trekkes tilbake. Et barn kan angre sine egne til en voksen har godkjent dem; en voksen kan angre alle. På kjøkkenskjermen trykker du på den ferdige oppgaven og bekrefter."
      },
      {
        "h": "Oppgaver fra andre apper"
      },
      {
        "p": "Et barns og et kjæledyrs medisindoser blir oppgaver med poeng, og det gjør også pakkingen før en reise eller en hendelse. En voksen kan krysse av et barns dose; poengene går likevel til barnet."
      },
      {
        "tips": [
          "En oppgave kan gjentas hver hverdag (mandag–fredag som ikke er røde dager) eller hver helgedag og rød dag – lufte hunden, mate katten. De røde dagene følger familiens land, så jul og påske regnes som helg av seg selv.",
          "Hvilken som helst plan: hver dag eller annenhver dag, valgte ukedager (hverdager, helg), med noen ukers mellomrom, en dato eller en ukedag i måneden (første lørdag), med noen måneders mellomrom, en gang i året – med poeng. Kjæledyr, hjemmet og kjøretøyene har sine gjentakende oppgaver med de samme valgene.",
          "Barn kan foreslå oppgaver; en voksen gjør dem om til oppgaver eller sier nei.",
          "Poengene går til butikken og ukepengene – se de temaene.",
          "En oppgave flere kan gjøre sammen, deler poengene mellom dem som gjorde den: velg hvem når den krysses av.",
          "Fjerner du en oppgave, beholdes poengene som allerede er tjent – og gangene den ble gjort."
        ]
      }
    ]
  },
  "allowance": {
    "title": "Ukepenger og sparing",
    "summary": "Ukepenger fra poeng eller et mål, og sparebøsser.",
    "blocks": [
      {
        "p": "Hvert barn tjener ukepenger enten fra poeng eller ved å nå et ukemål – familien velger per barn. Utbetalinger noteres, så alle ser hva som er betalt."
      },
      {
        "shot": "allowance",
        "caption": "Ukepengene og sparebøssene."
      },
      {
        "p": "Sparebøsser deler opp pengene: bruke, spare, gi eller et eget mål. Et barn kan foreslå et sparemål med en del av ukepengene; en voksen godkjenner det."
      }
    ]
  },
  "shop": {
    "title": "Belønningsbutikken og prestasjoner",
    "summary": "Bytt poeng mot belønninger, og lås opp prestasjoner.",
    "blocks": [
      {
        "p": "I butikken bytter barna poengene sine mot belønninger de voksne har lagt inn – en time spill, velge fredagsmiddagen. Et kjøp kan vente på en voksens godkjenning. Familiemål er belønninger hele familien sparer til sammen."
      },
      {
        "shot": "shop",
        "caption": "Belønninger i butikken."
      },
      {
        "p": "Prestasjoner låses opp av seg selv – første oppgave, en uke på rad – og nivået vokser med poengene."
      }
    ]
  },
  "littleones": {
    "title": "Lille modus",
    "summary": "Store bilder i stedet for tekst, for barn som ikke kan lese ennå.",
    "blocks": [
      {
        "p": "I Lille modus ser et barn store bildekort i stedet for appen: morgen- og kveldsrutiner i rekkefølge, barnehagesekken – trykk når det er gjort, for en liten fanfare og et klistremerke."
      },
      {
        "shot": "littleones",
        "caption": "Rutiner for de minste."
      },
      {
        "steps": [
          "Åpne Oppgaver → Lille modus.",
          "Slå på modusen for barnet – et barn på 6 år eller yngre som fødselsdagen ble oppgitt for, starter med den slått på.",
          "Start fra en ferdig rutine eller lag en egen med bilder."
        ]
      },
      {
        "tips": [
          "En voksen kommer ut av modusen ved å holde inne låsen og svare på et regnestykke.",
          "På kjøkkenskjermen kan hvert barn åpne rutinene sine ved å trykke på ansiktet sitt."
        ]
      }
    ]
  },
  "vault": {
    "title": "Hvelvet",
    "summary": "Bilder, filer, dokumenter, kvitteringer og passord på ett sted.",
    "blocks": [
      {
        "p": "Hvelvet tar vare på familiens bilder, chatbilder, filer, dokumenter og kvitteringer – alt kryptert på serveren deres. Filtrer per type, søk, og merk noe Bare meg så ingen andre ser det."
      },
      {
        "shot": "vault",
        "caption": "Alt i hvelvet, med et filter per type."
      },
      {
        "h": "Del med en lenke"
      },
      {
        "p": "Alt i hvelvet kan deles med en lenke som slutter å virke av seg selv – etter timer eller dager, eller når den er åpnet én gang. Velg om mottakeren får laste ned. Word, Excel og PowerPoint vises rett i nettleseren."
      },
      {
        "tips": [
          "Bilder fra samme dag tidligere år dukker opp som Minner på I dag.",
          "Serverens administrator bestemmer hvor stor en fil kan være."
        ]
      }
    ]
  },
  "documents": {
    "title": "Dokumenter",
    "summary": "Pass, ID-kort, forsikringer og avtaler – med påminnelser før de går ut.",
    "blocks": [
      {
        "p": "Ta vare på familiens dokumenter med en skanning: pass, ID-kort, førerkort, forsikringer, garantier, avtaler og vaksinasjoner. Numre vises maskert, og alt krypteres med familiens egen nøkkel."
      },
      {
        "shot": "documents",
        "caption": "Dokumenter med utløpsdato."
      },
      {
        "p": "En utløpsdato gir en påminnelse i tide og vises i kalenderen, så passet fornyes før ferien."
      }
    ]
  },
  "passwords": {
    "title": "Passord",
    "summary": "Familiens felles innlogginger, kryptert med familiens nøkkel.",
    "blocks": [
      {
        "p": "Ta vare på innlogginger i hvelvets visning Passord: strømmetjenesten, wifi-en, skolens plattform. De krypteres med familiens nøkkel. En voksen velger hvilke voksne en innlogging deles med; barna ser sine egne og de voksne ser barnas."
      },
      {
        "shot": "passwords",
        "caption": "Innlogginger, med et generert passord."
      },
      {
        "tips": [
          "Lag et sterkt passord med ett trykk.",
          "En innlogging som deles med en lenke, vises én gang – så slutter lenken å virke."
        ]
      }
    ]
  },
  "receipts": {
    "title": "Kvitteringer",
    "summary": "Kvitteringer som den lokale AI-en leser, med påminnelser for retur og garanti.",
    "blocks": [
      {
        "p": "Ta bilde av en kvittering eller velg et skjermbilde, og koble den til en bolig, et kjøretøy eller en kategori. Med den lokale AI-en leses butikk, beløp og dato for deg. Siste returdag og når garantien går ut, gir påminnelser, og reklamasjonsretten vises av seg selv."
      },
      {
        "shot": "receipts",
        "caption": "Kvitteringer med retur og garanti."
      },
      {
        "tips": [
          "Søk i kvitteringene, se Året i tall og eksporter dem til Excel.",
          "En kvittering for et barns ting kan deles med det andre hjemmet.",
          "Den lokale AI-en kan skrive et reklamasjonsbrev for deg.",
          "På Android deler du en kvittering fra en annen app rett til Smooth Family."
        ]
      }
    ]
  },
  "safety": {
    "title": "Nødkort og medisiner",
    "summary": "Det en barnevakt trenger å vite, og medisiner med påminnelser.",
    "blocks": [
      {
        "p": "Nødkortene har det viktigste hvis noe skjer: allergier, medisiner, fastlege, hvem man ringer og rutiner – ett for hver person og ett for hjemmet. De kan leses også uten nett."
      },
      {
        "shot": "safety",
        "caption": "Nødkortene. Et medlems kort og medisiner håndteres på medlemmets side under Familieinnstillinger → Familiemedlemmer; husstandens kort under Hverdagen."
      },
      {
        "h": "En barnevakt eller besteforeldrene"
      },
      {
        "p": "Lag en gjestelenke under Familieinnstillinger → Familiemedlemmer: den viser nødkortene, og det du velger av kalenderen og listene, i noen timer eller dager – så slutter den av seg selv."
      },
      {
        "h": "Medisiner"
      },
      {
        "p": "Legg til en medisin med dose, tider og en sluttdato for en kur. Et barns og et kjæledyrs doser blir oppgaver med poeng; de voksne får beskjed hvis en dose ikke krysses av. En voksens egne medisiner er private – de legges inn under Min profil og gir ingen poeng."
      }
    ]
  },
  "property": {
    "title": "Hjemmet",
    "summary": "Vedlikehold, ting per rom, energi og prosjekter – per bolig.",
    "blocks": [
      {
        "p": "Hver bolig – huset, leiligheten, hytta – har sitt eget kort med vedlikeholdet som skal gjøres, årets kostnader mot fjoråret, energien og de pågående prosjektene med budsjett mot det som er brukt."
      },
      {
        "shot": "property",
        "caption": "Ett kort per bolig."
      },
      {
        "p": "Vedlikehold som kommer igjen – takrennene, filtre, røykvarsleren – foreslås for typen bolig, påminnes på forhånd og vises i kalenderen; det kan også bli en oppgave. Ting per rom – hvitevarer, varmepumpen – tar vare på merke, pris, bruksanvisning og garanti."
      },
      {
        "tips": [
          "Strøm, vann og varme kan leses fra Home Assistants sensorer (bare lese).",
          "Skriv ut en liste over ting og kvitteringer til innboforsikringen."
        ]
      }
    ]
  },
  "economy": {
    "title": "Økonomi",
    "summary": "Hvor husholdningens penger går – med inntekter, budsjett og bankens fil.",
    "blocks": [
      {
        "p": "Økonomi viser husholdningens utgifter per kategori – mat, boligene, bilen, barna, fritid. Kvitteringer og boligenes, kjøretøyenes og reisenes kostnader telles med av seg selv. Hver voksen legger inn sin egen inntekt, og oversikten viser hva som kommer inn, går ut og blir igjen."
      },
      {
        "shot": "economy",
        "caption": "Måneden per kategori."
      },
      {
        "h": "Importer fra banken"
      },
      {
        "steps": [
          "Eksporter kontoens transaksjoner som CSV fra nettbanken.",
          "Last opp filen under Økonomi → Importer fra banken.",
          "Sjekk forslaget for hver rad – drivstoff til bilen, strømregningen til boligen – og lagre."
        ]
      },
      {
        "tips": [
          "Et budsjett per kategori og måned blir rødt når det sprekker.",
          "Poster kan være private, så bare du ser dem."
        ]
      }
    ]
  },
  "vehicles": {
    "title": "Kjøretøy",
    "summary": "EU-kontroll, service, dekk, kostnader og forbruk – for alt med motor eller hjul.",
    "blocks": [
      {
        "p": "Hvert kjøretøy har et kort med det som kommer – EU-kontroll, service, dekkskift, forsikring og avgift – og årets kostnader. Påminnelser går på dato eller kilometerstand, og den neste settes når du merker en som gjort."
      },
      {
        "shot": "vehicles",
        "caption": "Et kjøretøy med det som kommer."
      },
      {
        "p": "Legg inn tanking eller lading med liter eller kWh, så regnes forbruket ut; lading hjemme bruker dagens strømpris. Ta vare på dekksettene med sesong og mønsterdybde, og lag en rapport til en kjøper med servicehistorikken."
      },
      {
        "tips": [
          "Et bilde av kvitteringen eller en servicehistorikk som PDF leses av den lokale AI-en.",
          "Kilometerstanden kan leses fra en sensor i Home Assistant."
        ]
      }
    ]
  },
  "pets": {
    "title": "Kjæledyr",
    "summary": "Veterinærbesøk, vaksinasjoner, gjøremål og en bursdag.",
    "blocks": [
      {
        "p": "Hvert dyr har sine veterinærbesøk og vaksinasjoner, med påminnelse når de er aktuelle, og en bursdag blant bursdagene. Gjøremål som turer og mating blir oppgaver barna går på omgang med – og medisindoser følger den samme rekkefølgen."
      },
      {
        "shot": "pets",
        "caption": "Et kjæledyr med stellet sitt."
      },
      {
        "tips": [
          "En oppgave kan gjentas hver hverdag (mandag–fredag som ikke er røde dager) eller hver helgedag og rød dag – lufte hunden, mate katten. De røde dagene følger familiens land, så jul og påske regnes som helg av seg selv."
        ]
      }
    ]
  },
  "smarthome": {
    "title": "Smarthuset",
    "summary": "Lys, varme og høyttalere, flyter, hvem som er hjemme og strømprisen.",
    "blocks": [
      {
        "p": "Med Home Assistant koblet til styrer du hjemmets enheter fra Smooth Family – lys, persienner, varmepumpen, robotstøvsugeren, høyttalere – per rom og per bolig. Familiens administrator velger hvilke enheter som vises."
      },
      {
        "shot": "smarthome",
        "caption": "Enheter per rom."
      },
      {
        "h": "Flyter"
      },
      {
        "p": "Bygg egne automasjoner med Når → Hvis → Gjør: til en tid, med en knapp på I dag, når en enhet endres eller når noen kommer hjem – for eksempel tenn lyset på trappen når det blir mørkt. Flyter kan kjøres i Home Assistant selv, så de virker mens Smooth Family starter på nytt."
      },
      {
        "h": "Hvem er hjemme"
      },
      {
        "p": "Koble familien til personene i Home Assistant, så velger hver enkelt å vise hjemme eller borte – aldri hvor du er. Ingenting lagres."
      },
      {
        "tips": [
          "Strømprisen: et kort på I dag med dagens timer, og flyter som kjøres de billigste timene.",
          "Ingen Home Assistant? Prøv alt med det simulerte hjemmet."
        ]
      }
    ]
  },
  "homeassistant": {
    "title": "Koble til Home Assistant",
    "summary": "Hjemmets Home Assistant direkte – og andre hjem via gatewayen.",
    "blocks": [
      {
        "p": "Home Assistant i samme hjem som Smooth Family-serveren kobles direkte, med adressen og en langtidstoken. Et annet hjem – hytta – kobles i stedet via gatewayen, uten at noen port åpnes der."
      },
      {
        "steps": [
          "I Home Assistant: profilen din → Sikkerhet → Langtidstilgangstokener → Opprett token. Kopier den.",
          "I Smooth Family: Familieinnstillinger → Koblinger → Smarthus.",
          "Skriv adressen, f.eks. http://homeassistant.local:8123, og tokenet, og trykk Koble til.",
          "Legg til enhetene som skal vises, og koble hjemmet til riktig bolig."
        ]
      },
      {
        "shot": "homeassistant",
        "caption": "Hjem og enheter under Familieinnstillinger."
      },
      {
        "p": "Tokenet lagres kryptert på serveren. Smooth Family leser tilstander og styrer det du har lagt til; målere og sensorer for energi og kilometerstand leses bare."
      },
      {
        "tips": [
          "Bruk en adresse som virker fra serveren – en IP-adresse er tryggest.",
          "Familier på en annens server kobler alltid via gatewayen."
        ]
      }
    ]
  },
  "gateway": {
    "title": "Gatewayen – Home Assistant i et annet hjem",
    "summary": "Hyttas Home Assistant uten å åpne en port: som tillegg eller container.",
    "blocks": [
      {
        "p": "Gatewayen kjører ved siden av det andre hjemmets Home Assistant og ringer opp Smooth Family-serveren deres over HTTPS og holder linjen åpen. Ingen port åpnes der, og den virker bak 4G-rutere. Home Assistant-tokenet blir i det hjemmet; serveren kan bare be om tilstander og kall i de tillatte domenene – lås og alarm bare hvis du legger dem til."
      },
      {
        "h": "1. Lag en koblingskode"
      },
      {
        "p": "Familieinnstillinger → Koblinger → Smarthus → Legg til et hjem via tillegget. Gi det et navn og velg bolig; koden på åtte tegn gjelder i 24 timer."
      },
      {
        "shot": "gateway",
        "caption": "Et hjem via gatewayen, med versjonen."
      },
      {
        "h": "2. Installer – hvilken måte avhenger av Home Assistant"
      },
      {
        "p": "Innstillinger → Om i Home Assistant viser installasjonstypen."
      },
      {
        "details": [
          {
            "title": "Home Assistant OS eller Supervised: som tillegg",
            "blocks": [
              {
                "steps": [
                  "Innstillinger → Tillegg → Tilleggsbutikk → ⋮ → Repositorier, og legg til https://github.com/burnwalled/smoothfamily.",
                  "Smooth Family vises i butikken: installer det.",
                  "Fyll inn serverens adresse og paringskoden i alternativene, og start det."
                ]
              },
              {
                "p": "Tillegget bruker Home Assistants egen token – ingen langtidstoken trengs."
              }
            ]
          },
          {
            "title": "Home Assistant Container eller Core: som egen container",
            "blocks": [
              {
                "p": "Tillegg finnes ikke i disse installasjonene, så gatewayen kjører som en Docker-container ved siden av Home Assistant, eller på en Raspberry Pi i det hjemmet. Den trenger en langtidstoken fra profilen din i Home Assistant."
              },
              {
                "steps": [
                  "Hent gateway-mappen fra https://github.com/burnwalled/smoothfamily og bygg imaget: docker build -t smooth-family-gateway gateway/",
                  "Start den med SF_SERVER (serverens adresse), SF_PAIRING_CODE, HA_URL og HA_TOKEN, og et volum for /data.",
                  "Loggen sier Paired as … og så Connected to …."
                ]
              }
            ]
          }
        ]
      },
      {
        "h": "3. Oppdateringer"
      },
      {
        "p": "Gatewayen oppdaterer seg selv fra serveren deres – slått på som standard. Den kjører bare versjoner som er signert på datamaskinen utgivelsene lages på; ikke engang den som tok over serveren, kunne kjøre noe på hytta. Hvis en ny versjon ikke kobler til, kommer den forrige tilbake av seg selv. Hjemmet viser Nyeste versjon når den er oppdatert."
      },
      {
        "tips": [
          "Bytter du gatewayens datamaskin, eller kan nøkkelen ha lekket? Lag en ny kode – den gamle nøkkelen slutter å virke med en gang.",
          "Hvis linjen er nede, feiler en kommando med en gang i stedet for å kjøres sent."
        ]
      }
    ]
  },
  "halists": {
    "title": "Handlelister i Home Assistant",
    "summary": "Send en liste til Home Assistant – og derfra til butikkens app.",
    "blocks": [
      {
        "p": "En liste kan sendes til en av Home Assistants gjøremålslister, eller kobles til en så begge holdes like. Med en butikks integrasjon installert i Home Assistant vises listen så i butikkens egen app. Det som kjøpes der, krysses av her og havner under Nettopp kjøpt i spiskammeret."
      },
      {
        "steps": [
          "Installer butikkens integrasjon i Home Assistant (lenker i dialogen – laget av andre, på egen risiko).",
          "Åpne listen i Smooth Family → Home Assistant.",
          "Velg gjøremålslisten, og send én gang eller koble listene."
        ]
      },
      {
        "note": "Nytt og ikke fullt testet med butikkene ennå: det virker så godt som butikkens integrasjon synkroniserer kryssene tilbake."
      }
    ]
  },
  "kiosk": {
    "title": "Kjøkkenskjermen",
    "summary": "Et nettbrett på veggen med familiens dag.",
    "blocks": [
      {
        "p": "Koble til et nettbrett med en egen lenke eller QR-kode. Det viser familiens dag: dagens og morgendagens kalender med hvem som kjører, hvem som er hjemme, været, oppgavene, middagen og skolematen, søppeltømmingen og strømprisen – og en knapp for nødkortet. Ingenting privat vises, og skjermen har ingen konto."
      },
      {
        "shot": "kiosk",
        "caption": "Kjøkkenskjermen."
      },
      {
        "h": "På skjermen"
      },
      {
        "p": "Oppgaver krysses av rett der, med store rader for fingre: trykk på en, så på ansiktet ditt – for en oppgave dere gjorde sammen, alle som hjalp til, og poengene deles. Ukens mat og oppskriftsboken åpner matlagingsmodus: oppskriften i stor skrift, ingredienser å krysse av og trinnene ett om gangen. Smartenhetene som er valgt for skjermen, styres med et trykk."
      },
      {
        "h": "Skjermspareren"
      },
      {
        "p": "Etter minuttene du velger, kommer skjermspareren: familiens bilder, en klaffeklokke, en rolig klokke med været, en mørk skjerm – eller reven, som viser været ute. Den leser når det er grått, flyr drage når skyene drar forbi, holder paraplyen i regnet, bygger snømann når det snør og sover om natten, og dagens oppgaver vises over vannet. Et trykk vekker skjermen."
      },
      {
        "p": "Med noen minutters mellomrom gjør reven noe lite som passer været – hopper, plasker i en vannpytt, kaster snøball, ser et stjerneskudd – og av og til hopper en hare forbi eller en fisk hopper i vannet. Den kler seg ut til halloween, jul, nyttår, påske og sankthans, og på en bursdag (personene under Bursdager) får den ballonger, festhatt og et banner med navnet. Høytidene følger familiens land; utkledningen slås av per skjerm under skjermspareren. Med redusert bevegelse på nettbrettet står reven stille."
      },
      {
        "steps": [
          "Familieinnstillinger → Kjøkkenskjerm → Koble til en skjerm.",
          "Åpne lenken på nettbrettet (eller skann QR-koden) og legg den til på startskjermen.",
          "Under skjermen velger du hva den viser, skjermsparer, farger, språk og natt."
        ]
      },
      {
        "tips": [
          "Alt om en skjerm finnes under Familieinnstillinger → Kjøkkenskjerm: navnet, skjermspareren (med et bilde av hver), hva den viser, farger og språk, når den dempes om natten, hvilke smartenheter den kan styre og hva den kan gjøre. Én knapp gir alle skjermer de samme innstillingene, og en skjerm henter en endring innen ett minutt.",
          "Ukens mat og oppskriftsboken velges per skjerm – de er slått av til du slår dem på.",
          "En lås vises aldri på skjermen, uansett hva du velger.",
          "En mistet lenke erstattes med Ny lenke; Koble fra stenger lenken helt.",
          "De små kan åpne bilderutinene sine der ved å trykke på ansiktet sitt.",
          "Fullskjerm med knappen i hjørnet (på en iPad legger du i stedet skjermen til på startskjermen)."
        ]
      }
    ]
  },
  "localai": {
    "title": "Den lokale AI-en",
    "summary": "En AI på en datamaskin hjemme – for kvitteringer, oppskrifter og forslag.",
    "blocks": [
      {
        "p": "Smooth Family kan bruke en AI som kjører på en datamaskin i hjemmet deres med Ollama. Den leser kvitteringer og servicehistorikk, gjør tekst eller et bilde om til en oppskrift, foreslår ukens middager og gjøremål, og svarer på spørsmål med nettsøk. Ingenting sendes til en ekstern tjeneste."
      },
      {
        "shot": "localai",
        "caption": "Jobber for den lokale AI-en."
      },
      {
        "p": "Serverens administrator setter den opp én gang (Serverinnstillinger → AI-maskinen) – den trenger en datamaskin med et brukbart grafikkort. Så velger hver familie å slå den på. Jobbene settes i kø, så maskinen kan sove og vekkes når det er noe å gjøre."
      },
      {
        "tips": [
          "Alt AI-en foreslår, vises for deg før det lagres.",
          "Uten AI-en kan du fortsatt kopiere spørsmålet til en AI du selv velger."
        ]
      }
    ]
  },
  "websearch": {
    "title": "Søke på nettet",
    "summary": "Søk via serverens egen søkemotor – bare ordene forlater serveren.",
    "blocks": [
      {
        "p": "Når serverens administrator har slått på søket, kan du søke på nettet fra Smooth Family: etter ønsker og gaver, oppskrifter, bruksanvisninger for ting i hjemmet, fakta om bilen og ting å finne på. Søket kjører på deres egen server (SearXNG), så bare søkeordene forlater den – ikke hvem som spør."
      },
      {
        "p": "Med den lokale AI-en kan du også stille et spørsmål og få et svar med kilder fra nettet."
      }
    ]
  },
  "family": {
    "title": "Familieinnstillinger",
    "summary": "Medlemmer, hvilke apper hver enkelt ser, og familiens hverdag.",
    "blocks": [
      {
        "p": "Familieinnstillingene er for den som styrer familien. Administratoren legger til medlemmer og velger hvilke apper hver enkelt ser; en voksen administratoren stoler på, kan få lov til å endre hverdagsinnstillingene også."
      },
      {
        "shot": "family",
        "caption": "Alle i familien; åpne én for alt om personen."
      },
      {
        "h": "Et medlems egen side"
      },
      {
        "p": "Trykk på et medlem for alt om personen på ett sted: navn, farge og bilde, nytt passord og tilbakestilling av totrinnspålogging, hvilke apper personen bruker – og for et barn språket i appen, fødselsdagen, Lille modus, ukepengene, medisinene og nødkortet. En voksens egne medisiner forblir private, og voksne velger sitt eget bilde."
      },
      {
        "h": "Hva finnes hvor"
      },
      {
        "p": "Familiemedlemmer: alle, hver med sin egen side (innlogging, apper, språk, bilde – og for et barn fødselsdag, ukepenger, Lille modus, to hjem, medisin og nødkort), andre personer uten konto for fødselsdagene deres, og gjestelenker for barnevakten eller besteforeldrene. Hverdagen: kalendere, hjemmet, Idags kilder, poengreglene, husstandens nødkort og kjæledyrenes medisin. Kjøkkenskjerm. Familiemedlemmer: smarthjemmet og den lokale AI-en. Sikkerhet og data: sikkerhetskopier og eksport."
      },
      {
        "tips": [
          "Oppgi et barns fødselsdag når du legger det til – et barn på 6 år eller yngre starter i Lille modus.",
          "Familiens kom i gang-veiledning kan åpnes igjen øverst i Familieinnstillinger.",
          "Et nytt medlem starter med administratorens språk; en forelder endrer barnets på barnets side."
        ]
      }
    ]
  },
  "familydata": {
    "title": "Familiens data og sikkerhetskopier",
    "summary": "Eksport, familiens egen nøkkel og å flytte familien.",
    "blocks": [
      {
        "p": "Under Familieinnstillinger → Sikkerhet og data kan administratoren eksportere familiens data og, på en server som drives av andre, velge en egen nøkkel for familien: familiens sikkerhetskopier forsegles da så bare dere kan åpne dem – ikke engang serverens administrator."
      },
      {
        "shot": "familydata",
        "caption": "Familiens sikkerhetskopier og nøkkel."
      },
      {
        "tips": [
          "Oppbevar nøkkelen utenfor serveren, som et viktig passord – uten den kan sikkerhetskopiene ikke gjenopprettes.",
          "Loggen viser innlogginger og endringer i familien."
        ]
      }
    ]
  },
  "profile": {
    "title": "Min profil",
    "summary": "Navnet ditt, bilde, språk, meny, varsler og sikkerhet.",
    "blocks": [
      {
        "p": "Min profil har fire faner. Om meg: navn, bilde, språk og tema, nødkortet ditt og dine egne medisiner. Meny: appenes rekkefølge og hvilke som er skjult. Varsler: hva som sendes, og morgensammendraget. Sikkerhet og koblinger: passord, passkeys, totrinnskoder og mobilkalenderen din."
      },
      {
        "shot": "profile",
        "caption": "Min profil."
      }
    ]
  },
  "server": {
    "title": "Serverinnstillinger",
    "summary": "For den som styrer serveren: familier, innloggingsregler, adressen og loggen.",
    "blocks": [
      {
        "p": "Serverens administrator bestemmer det som er likt for alle familier på serveren. Inviter andre familier med en lenke – de kan prøve en demo først – og sett en familie på pause, flytt eller fjern den. Administratoren ser aldri familienes innhold."
      },
      {
        "shot": "server",
        "caption": "Familiene på serveren."
      },
      {
        "p": "Sikkerhet setter reglene for passkeys, totrinnskoder og hvor lange passord skal være. Adresse og tjenester har serverens adresse på internett, søket og tjenestene for alle familier. Serverens kom i gang-veiledning kan åpnes igjen øverst."
      }
    ]
  },
  "serverbackups": {
    "title": "Sikkerhetskopier og nøkkelen",
    "summary": "Sikkerhetskopi hver natt, forseglet med en nøkkel bare du har.",
    "blocks": [
      {
        "p": "Serveren tar en sikkerhetskopi hver natt og tar vare på 30 dager. Med en nøkkel forsegles de: serveren kan lage dem, men aldri lese dem, og nøkkelen er nok til å få tilbake alt på en ny server."
      },
      {
        "shot": "serverbackups",
        "caption": "Sikkerhetskopier, forseglet med nøkkelen."
      },
      {
        "steps": [
          "Serverinnstillinger → Sikkerhetskopier og flytting → Lag nøkkel. Nøkkelen lages i nettleseren din; serveren får bare den offentlige halvdelen.",
          "Lagre den i en passordbehandler, skriv den ut eller last den ned – og bekreft med de siste tegnene.",
          "Prøv nøkkelen mot den nyeste sikkerhetskopien med Prøv nøkkelen min."
        ]
      },
      {
        "note": "Uten nøkkelen kan sikkerhetskopiene ikke gjenopprettes, og ingen kan lage den til deg igjen."
      }
    ]
  },
  "serverupdates": {
    "title": "Oppdateringer",
    "summary": "Smooth Family og serverens deler, av seg selv – og gatewayenes versjoner.",
    "blocks": [
      {
        "p": "Databasen, Redis, webserveren og søkemotoren får sikkerhetsrettinger mellom Smooth Familys utgivelser. Velg om de legges inn av seg selv i et ukentlig vindu eller etter at du har godkjent. En sikkerhetskopi tas først, og hvis de nye versjonene ikke kommer opp, settes de gamle tilbake."
      },
      {
        "shot": "serverupdates",
        "caption": "Versjoner, vinduet og gatewayene."
      },
      {
        "h": "Smooth Family selv"
      },
      {
        "p": "Velg en kanal under Smooth Family selv, så oppdaterer serveren også appen, samtidig med resten: Stabil følger utgivelsene, Beta hver endring så snart den er klar. Bare versjoner som prosjektet har signert, legges inn, databasen lagres først, og hvis den nye versjonen ikke starter, kommer den gamle og databasen tilbake. Av til du velger – å se etter er et kall til GitHub."
      },
      {
        "p": "Kortet Gatewayer viser hver gateway på serveren, versjonen hver enkelt rapporterte og om den oppdaterer seg selv – så du ser at alle er oppdatert."
      },
      {
        "note": "Serverens update.sh må planlegges hver time én gang (på en Synology: Oppgaveplanlegger, bruker root) for at oppdateringer skal legges inn."
      }
    ]
  },
  "serverservices": {
    "title": "Tjenester, lokal AI og søk",
    "summary": "Serverens adresse, søkemotoren, den lokale AI-en og andre tjenester.",
    "blocks": [
      {
        "p": "Adresse og tjenester har adressen serveren nås på – den brukes i alle lenker som sendes ut – oppskriftssøket og nettsøket (SearXNG på serveren selv), Home Assistant for familier på serveren via gatewayen, GIF-er i chatten og å sende tilbakemelding. AI-maskinen stiller inn hvor Ollama kjører, hvilke modeller som brukes, og vekking og hvilemodus for maskinen. E-post setter opp e-posttjenestene – Gmail med et app-passord, Brevo for en adresse på deres eget domene, Exchange Online via en appregistrering i Microsoft Entra eller en annen SMTP-server – hvilken familien deres sender med, og om de hostede familiene også kan sende e-post (til festgjester som har bedt om oppdateringer). Adresser slår på forslagene fra OpenStreetMap i adressefeltene (via komoots Photon eller en egen) – eller av."
      },
      {
        "shot": "serverservices",
        "caption": "Serverens tjenester."
      }
    ]
  },
  "feedback": {
    "title": "Rapporter et problem",
    "summary": "Noe som er feil, eller et ønske – til serverens administrator.",
    "blocks": [
      {
        "p": "Funnet noe som ikke virker, eller ønsker du deg noe nytt? Skriv det under Rapporter et problem i profilmenyen. Det går til den som driver serveren, med siden du var på og nettleseren din, og et skjermbilde om du legger til et."
      },
      {
        "steps": [
          "Åpne profilmenyen → Rapporter et problem.",
          "Velg Noe er feil eller Ønske, og skriv hva som skjedde eller hva du ønsker deg.",
          "Legg til et skjermbilde om det hjelper – lim inn, slipp det eller ta et bilde."
        ]
      },
      {
        "tips": [
          "Du ser rapportene dine på samme side: mottatt, planlagt, fikset eller ikke planlagt – med en linje fra serveradministratoren når det finnes en.",
          "Du får et varsel når statusen til en rapport endres.",
          "Familiens administrator ser hele familiens rapporter."
        ]
      }
    ]
  },
  "devices": {
    "title": "Enheter",
    "summary": "Hva som er koblet til med familiens konto, og om det står bra til.",
    "blocks": [
      {
        "p": "Familieinnstillinger → Enheter viser hva som snakker med serveren for familien: mobilene og datamaskinene medlemmene logger inn på, kjøkkenskjermene og gatewayene – som Home Assistant-appen eller en egen container. Et kart plasserer dem rundt serveren; listen har hver enhets versjon, når den sist ble sett og hvordan den har det."
      },
      {
        "shot": "devices",
        "caption": "Familiens enheter rundt serveren."
      },
      {
        "h": "Helse"
      },
      {
        "p": "Grønn: står bra til. Oransje: en gammel versjon – en app som bør åpnes igjen, eller en gateway som skal oppdateres. Grå: et medlems enhet som ikke er brukt på en stund. Rød: en kjøkkenskjerm eller gateway som ikke er der. Under en enhet som ikke står bra til, står det i listen hva du gjør."
      },
      {
        "tips": [
          "En enhet som ikke er sett på 7 dager, forsvinner fra kartet, men blir i listen; et medlems gamle mobil kan glemmes der.",
          "Bare typen enhet, nettleser og system, appversjonen og når den sist ble brukt, lagres – ingen adresse, intet sted.",
          "Serveradministratoren ser enhetene deres som typer, aldri navn, og kan be dere se til en."
        ]
      }
    ]
  },
  "serverreports": {
    "title": "Rapporter fra familiene",
    "summary": "Les, svar på og send videre feil og ønsker.",
    "blocks": [
      {
        "p": "Alle familienes rapporter om feil og ønsker kommer til Serverinnstillinger → Rapporter, og du får et varsel. Åpne en for å lese den med side, nettleser og skjermbilde; sett status – mottatt, planlagt, fikset eller ikke planlagt – og skriv en linje til den som rapporterte, som får beskjed."
      },
      {
        "h": "Til prosjektet"
      },
      {
        "p": "Kryss av rapportene Smooth Family-prosjektet bør kjenne til, og trykk Eksporter. Du får en anonym tekst – hva og hvor, aldri hvem eller hvilken familie – og GitHubs skjema i prosjektets offentlige repo åpnes utfylt med den og etiketten from-server-admin. Les gjennom og trykk Create der. En tekst som er for lang for lenken, kopieres så du kan lime den inn."
      },
      {
        "tips": [
          "Serveren sender ingenting: eksporten åpner bare GitHub i nettleseren din.",
          "Eksporterte rapporter merkes, så du ikke sender dem to ganger."
        ]
      }
    ]
  },
  "serverdevices": {
    "title": "Familienes enheter",
    "summary": "Hver families enheter etter type, versjoner og helse.",
    "blocks": [
      {
        "p": "Serverinnstillinger → Enheter plasserer serveren i midten med hver familie rundt seg, og rundt hver familie dens typer enheter: mobiler, nettbrett, datamaskiner, kjøkkenskjermer, gatewayer og Home Assistant-apper. Du ser hvor mange, hvilke versjoner de kjører og om de står bra til – aldri hvem de tilhører eller hva de heter."
      },
      {
        "p": "Appens versjon er serverens egen; en gateway skal kjøre den nyeste serveren deler ut. Når en familie har en enhet med gammel versjon eller en som ikke er der, sender Be familien se til et varsel til familiens administratorer om hvilke typer og hvorfor."
      },
      {
        "tips": [
          "En enhet som ikke er sett på 7 dager, forsvinner fra kartet.",
          "En gateway oppdaterer seg selv hvis automatisk oppdatering er på – en gammel betyr som regel at den er slått av."
        ]
      }
    ]
  }
};

export default texts;
