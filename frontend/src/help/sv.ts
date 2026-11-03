// Help texts (sv): every topic in topics.ts, with the same blocks as en.ts (help.test.ts checks it).
import type { TopicText } from "./types";

const texts: Record<string, TopicText> = {
  "start": {
    "title": "Kom igång",
    "summary": "Vad Smooth Family är, hur appen är uppbyggd och var du hittar saker.",
    "blocks": [
      {
        "p": "Smooth Family är familjens egen app för kalendern, listorna, uppgifterna, maten, hemmet och det smarta hemmet. Den körs på en server hemma hos er – en NAS eller en liten dator – så era foton, meddelanden och planer stannar hos er. Inget skickas till stora företag, och AI:n är lokal och bara på om ni vill."
      },
      {
        "shot": "today",
        "caption": "Idag samlar dagen: kalendern, uppgifterna, vädret och mer."
      },
      {
        "h": "Installera den som en app"
      },
      {
        "steps": [
          "Öppna familjens adress i telefonens webbläsare och logga in.",
          "iPhone: tryck Dela → Lägg till på hemskärmen. Android: tryck ⋮ → Installera app (eller Lägg till på startskärmen).",
          "Öppna Smooth Family från hemskärmen – den startar i helskärm och kan skicka notiser."
        ]
      },
      {
        "h": "Hitta rätt"
      },
      {
        "p": "På telefonen ligger de mest använda apparna i listen längst ner och resten under Mer; på datorn finns de i menyn till vänster. Appar som hör ihop är flikar högst upp på sidan – Kalender har Resor, Två hem och Söndagskollen, Mat har Receptboken och Skafferiet."
      },
      {
        "p": "Inställningarna finns i tre nivåer, alla i menyn bakom din bild: Min profil (dina egna), Familjeinställningar (för den som sköter familjen) och Serverinställningar (för den som sköter servern)."
      },
      {
        "tips": [
          "Frågetecknet bredvid en sidas rubrik öppnar hjälpen för den sidan.",
          "Ändra ordningen i menyn, eller dölj appar du inte använder, under Min profil → Meny.",
          "Vilka appar var och en ser väljer familjens admin under Familjeinställningar → Familjemedlemmar."
        ]
      }
    ]
  },
  "signin": {
    "title": "Logga in och vara säker",
    "summary": "Lösenord, passkeys med Face ID eller fingeravtryck, och tvåstegskoder.",
    "blocks": [
      {
        "p": "Du loggar in med ditt användarnamn och lösenord. Vuxnas lösenord har minst 12 tecken om inte serverns admin valt något annat – det är längden som gör ett lösenord svårt att knäcka. Barn kan ha kortare."
      },
      {
        "h": "Passkeys – logga in med ansiktet eller fingret"
      },
      {
        "steps": [
          "Öppna Min profil → Säkerhet och kopplingar.",
          "Tryck Lägg till passkey och följ telefonens eller datorns anvisningar.",
          "Nästa gång väljer du Logga in med passkey på inloggningssidan."
        ]
      },
      {
        "shot": "signin",
        "caption": "Passkeys och tvåstegskoder under Min profil."
      },
      {
        "h": "Tvåstegskoder"
      },
      {
        "p": "Med tvåstegskoder skriver du en sexsiffrig kod från en app som Microsoft eller Google Authenticator efter lösenordet. Serverns admin kan göra dem obligatoriska för vuxna. De fungerar utan uppkoppling – ingen extern tjänst är inblandad."
      },
      {
        "tips": [
          "Glömt lösenordet? Fråga familjens admin, som sätter ett nytt under Familjeinställningar → Familjemedlemmar.",
          "Tappat telefonen med koderna? Admin kan nollställa din tvåstegsinloggning på samma ställe.",
          "En passkey hör till adressen den skapades på; byter familjen adress gör du en ny."
        ]
      }
    ]
  },
  "notifications": {
    "title": "Notiser och morgonsammanfattningen",
    "summary": "Klockan, notiser på telefonen och en sammanfattning av dagen varje morgon.",
    "blocks": [
      {
        "p": "Allt som händer för dig – en uppgift att godkänna, ett meddelande, en påminnelse, en medicindos – hamnar under klockan högst upp. Siffran visar hur många du inte läst. Samma notiser kan också skickas till telefonen."
      },
      {
        "shot": "notifications",
        "caption": "Notiscentret sparar allt, läst eller inte."
      },
      {
        "h": "På telefonen"
      },
      {
        "steps": [
          "Öppna Min profil → Notiser.",
          "Slå på notiser för den här enheten och tillåt dem när telefonen frågar.",
          "Välj vad som ska skickas – resten hamnar ändå under klockan."
        ]
      },
      {
        "p": "Morgonsammanfattningen är en notis vid den tid du väljer – vardagar eller varje dag – med dagens händelser, dina uppgifter och mediciner, skolmaten och vädret."
      },
      {
        "tips": [
          "iPhone: notiser fungerar bara när Smooth Family är tillagd på hemskärmen.",
          "Varje enhet slås på för sig – telefonen och surfplattan behöver det var för sig."
        ]
      }
    ]
  },
  "offline": {
    "title": "Utan täckning",
    "summary": "Listor och uppgifter fungerar i en butik utan mottagning.",
    "blocks": [
      {
        "p": "Smooth Family sparar det du har öppnat, så appen fungerar när uppkopplingen försvinner. På inköpslistan kan du bocka av, lägga till och ta bort, och du kan bocka av uppgifter. Ändringarna syns direkt och märks med ett litet moln tills de har skickats."
      },
      {
        "p": "En markering högst upp visar att du är offline och hur många ändringar som väntar. När uppkopplingen kommer tillbaka skickas de av sig själva, i den ordning du gjorde dem."
      },
      {
        "tips": [
          "Andra sidor visar det som senast laddades men kan inte ändras förrän du är uppkopplad igen.",
          "Om någon annan ändrat samma sak under tiden gäller den senaste ändringen."
        ]
      }
    ]
  },
  "today": {
    "title": "Idag",
    "summary": "Familjens dag på en sida – med de kort du själv väljer.",
    "blocks": [
      {
        "p": "Idag är första sidan. Den visar det som är viktigt nu: veckans kalender, dina uppgifter, inköpslistan, vädret, elpriset, sophämtningen, skolmaten, det i skafferiet som bör ätas snart, det som är på gång för hemmet och fordonen, vem som är hemma – och mer."
      },
      {
        "shot": "today",
        "caption": "Varje kort kan flyttas, läggas till eller tas bort."
      },
      {
        "steps": [
          "Tryck Anpassa längst ner på Idag.",
          "Lägg till kort med Lägg till widget, dra dem i den ordning du vill, eller ta bort dem.",
          "Tryck Klar."
        ]
      },
      {
        "tips": [
          "Kortens källor – orten för vädret, sophämtningens kalender och skolan – ställs in under Familjeinställningar → Vardagen.",
          "Ett kort för en app du inte får använda visas inte."
        ]
      }
    ]
  },
  "calendar": {
    "title": "Kalendern",
    "summary": "Familjens kalender med skolans och föreningarnas, vem som kör och vad som ska packas.",
    "blocks": [
      {
        "p": "Kalendern visar familjens egna händelser tillsammans med kalendrar ni prenumererar på – skolan, idrottsföreningen, jobbet. Växla mellan veckan timme för timme, månaden och listan. Händelser över flera dagar är en stapel över dem, och veckonumret står i kanten."
      },
      {
        "shot": "calendar",
        "caption": "Veckan, timme för timme."
      },
      {
        "h": "Lägg till en händelse"
      },
      {
        "p": "Tryck + Ny händelse, ge den en titel och en tid, och välj vem den gäller – eller låt den gälla alla. Familjens händelser delas med alla i familjen."
      },
      {
        "h": "Vem kör, och vad ska packas"
      },
      {
        "p": "Tryck på Skjuts & packning vid en händelse – i kalendern eller i Söndagskollen – för att säga att skjuts behövs och ta lämningen eller hämtningen – eller, med Någon annan, skriva vem utanför familjen som kör, till exempel en lagkompis förälder. Ge den en packlista: samma lista kommer tillbaka för varje händelse med samma titel, som varje fotbollsträning, och bockas av för varje gång. En vuxen kan välja dagen då det är dags att packa, och den som ska dit får en uppgift den dagen."
      },
      {
        "shot": "calendar-month",
        "caption": "Månaden skriver ut vad som händer varje dag."
      },
      {
        "h": "Prenumerera på en kalender"
      },
      {
        "p": "Kalendrar läses via en privat iCal-länk. Så här hittar du länken i de vanligaste tjänsterna:"
      },
      {
        "details": [
          {
            "title": "Google Kalender (Gmail)",
            "blocks": [
              {
                "steps": [
                  "Öppna calendar.google.com på en dator – länken finns inte i mobilappen.",
                  "I vänsterspalten under \"Mina kalendrar\": håll muspekaren över kalendern och klicka på ⋮ → \"Inställningar och delning\".",
                  "Scrolla ner till \"Integrera kalender\".",
                  "Kopiera \"Hemlig adress i iCal-format\" (slutar på .ics). Använd inte \"Offentlig adress\" – den fungerar bara om kalendern är offentlig."
                ]
              },
              {
                "note": "Jobb- eller skolkonton: administratören kan ha stängt av den hemliga adressen. Saknas den, fråga dem eller använd ett privat konto."
              }
            ]
          },
          {
            "title": "Outlook / Microsoft 365",
            "blocks": [
              {
                "steps": [
                  "Öppna outlook.com (privat konto) eller outlook.office.com (jobb/skola) i webbläsaren.",
                  "Klicka på kugghjulet (Inställningar) → Kalender → Delade kalendrar.",
                  "Under \"Publicera en kalender\": välj kalendern och \"Kan visa all information\", klicka sedan på Publicera.",
                  "Kopiera ICS-länken – inte HTML-länken."
                ]
              },
              {
                "note": "Klassiska Outlook för Windows kan inte publicera kalendrar – använd Outlook på webben eller nya Outlook. I jobbkonton kan administratören ha spärrat publicering."
              }
            ]
          },
          {
            "title": "iCloud (iPhone / Mac)",
            "blocks": [
              {
                "steps": [
                  "Öppna appen Kalender på iPhone och tryck på \"Kalendrar\" längst ner.",
                  "Tryck på (i) bredvid kalendern du vill lägga till.",
                  "Slå på \"Offentlig kalender\" och tryck på \"Dela länk…\" → Kopiera.",
                  "Länken börjar med webcal:// – klistra in den som den är."
                ]
              },
              {
                "note": "\"Offentlig\" betyder att alla som har länken kan läsa kalendern. Den listas inte någonstans, men håll länken privat."
              }
            ]
          },
          {
            "title": "SportAdmin (förenings- och lagaktiviteter)",
            "blocks": [
              {
                "steps": [
                  "Öppna SportAdmin-appen och gå till \"Aktiviteter\".",
                  "Tryck på kalenderikonen uppe till höger.",
                  "Välj att kopiera länken (prenumerera direkt lägger bara till kalendern i din telefon).",
                  "Klistra in länken i Smooth Family. Den börjar oftast med webcal://cal.sportadmin.se/."
                ]
              },
              {
                "note": "Syns inga aktiviteter? Laget måste vara kopplat till föreningens kalender i SportAdmin – fråga lagledaren. Många föreningssajter har också en \"Prenumerera\"-knapp på kalendersidan: högerklicka på den och kopiera länkadressen. Lägg till en prenumeration per lag och ge var och en en egen färg."
              }
            ]
          },
          {
            "title": "MyClub (klubbens och lagets kalender)",
            "blocks": [
              {
                "steps": [
                  "Öppna klubbens webbplats på MyClub (klubbnamn.myclub.se) och gå till lagets kalender, eller sidan om att prenumerera på kalendern.",
                  "Kopiera prenumerationslänken. Ett lags ser ut som webcal://calendar.myclub.se/public/teams/12345/calendar.ics – hela klubbens har /public/clubs/ i stället.",
                  "Klistra in länken i Smooth Family."
                ]
              },
              {
                "note": "Hittar du inte länken? Be lagledaren om kalenderns prenumerationslänk – det är samma som klubben ger för iPhone och Google. Lägg till en prenumeration per lag, ge var och en en egen färg och välj barnet den gäller."
              }
            ]
          },
          {
            "title": "laget.se (klubbens och lagets kalender)",
            "blocks": [
              {
                "steps": [
                  "Öppna lagets sida på laget.se, till exempel laget.se/Lagnamn.",
                  "Gå till Kalender och klicka på Prenumerera under kalendern.",
                  "Kopiera länken. Den ser ut som webcal://cal.laget.se/Lagnamn.ics – samma namn som i lagets laget.se-adress.",
                  "Klistra in länken i Smooth Family."
                ]
              },
              {
                "note": "Kalendern från laget.se visar en månad bakåt och sex månader framåt. Lägg till en prenumeration per lag, ge var och en en egen färg och välj barnet den gäller."
              }
            ]
          },
          {
            "title": "Lägg till länken i Smooth Family",
            "blocks": [
              {
                "steps": [
                  "Öppna profilmenyn (uppe till höger) → Familjeinställningar → Kalenderprenumerationer.",
                  "Skriv ett namn alla känner igen, t.ex. \"Skolan\" eller \"Edvin – fotboll\".",
                  "Klistra in länken och välj en färg.",
                  "Klicka på Lägg till. Händelserna syns i kalendern och på Idag-sidan."
                ]
              }
            ]
          },
          {
            "title": "Fungerar något inte?",
            "blocks": [
              {
                "tips": [
                  "Nya händelser kan ta upp till 15 minuter att dyka upp – kalendrarna cachas så att tjänsterna inte överbelastas.",
                  "Fel när du lägger till? Kontrollera att länken börjar med https:// eller webcal:// och att du kopierat iCal/ICS-länken, inte en länk till en webbsida.",
                  "Har en länk läckt? Skapa en ny hos leverantören (Google: \"Återställ\" den hemliga adressen) och byt ut den här."
                ]
              }
            ]
          }
        ]
      },
      {
        "tips": [
          "Prenumererade kalendrar går bara att läsa och uppdateras var 15:e minut.",
          "Din egen kalender kan läggas in i telefonen med prenumerationslänken under Min profil."
        ]
      },
      {
        "h": "Röda dagar"
      },
      {
        "p": "Landets helgdagar syns i kalendern som röda dagar, och aftnarna som fungerar som helgdagar (julafton, midsommarafton …) i en ljusare röd. Välj land – eller stäng av – under Familjeinställningar → Vardagen. För ett annat land lägger du till en publik helgdagskalender som prenumeration."
      }
    ]
  },
  "trips": {
    "title": "Resor",
    "summary": "Planera resan tillsammans: datum, resplan, packning per person och en budget.",
    "blocks": [
      {
        "p": "En resa har datum och resmål – den syns i kalendern – och vilka som åker. Lägg till resplanen med resor, boenden och aktiviteter (biljetter kan länkas från valvet), en gemensam budget och en checklista före avresan, som att stänga av vattnet."
      },
      {
        "shot": "trips",
        "caption": "Packning per resenär, med färdiga listor."
      },
      {
        "h": "Packning"
      },
      {
        "p": "Varje resenär har sin egen packlista, plus en gemensam. Börja från en mall – bad, skidor eller helg – och lägg till resten. En vuxen kan välja dagen då det är dags att packa: varje resenär får då en uppgift den dagen, med poäng, och en länk till sin egen lista."
      },
      {
        "tips": [
          "Kvällen innan avresan påminns alla som åker om det som är kvar att packa och kolla.",
          "Barnen ser och packar sina egna saker; de vuxna planerar resten."
        ]
      }
    ]
  },
  "parties": {
    "title": "Fest",
    "summary": "Planera en fest tillsammans – en inbjudningssida för gästerna, och checklistan, budgeten och tidsplanen för er.",
    "blocks": [
      {
        "p": "Under Kalender → Fest planerar du ett barnkalas, en fest eller en middag. Gästerna får en gemensam inbjudningssida – utan konto – där de läser om festen, lägger in det i sin egen kalender och svarar med för- och efternamn och eventuella allergier, och en +1 om ni tillåter det. De kan ändra sitt svar senare på samma enhet. Ni väljer vad de ser av varandra: inget, hur många som kommer eller namnen."
      },
      {
        "steps": [
          "Kalender → Fest → Ny fest: namnet, typen, vems fest, tiden och platsen, OSA-datumet och om +1 är tillåtet.",
          "Under Inbjudan skriver du inbjudan och trycker Dela – telefonens egen delningsmeny öppnas med texten och länken (eller kopiera länken eller skriv ut QR-koden).",
          "Följ svaren under Gäster – med allergierna samlade på ett ställe – och lägg själv in ett svar som kom via sms."
        ]
      },
      {
        "h": "Planeringen"
      },
      {
        "p": "En ny fest börjar med en checklista – dela inbjudan, tårtan, dekorationer, påminn dem som inte svarat, räkna gästerna, handla och tacka – med datum; varje morgon något ska göras blir de vuxna påminda. Ändra den som ni vill. Budget håller koll på vad som spenderats mot budgeten, Tidsplan på dagens plan (ett barnkalas börjar med en)."
      },
      {
        "tips": [
          "Inget bestämt datum än: kryssa i Låt gästerna rösta om datum och lägg till de datum som passar er. Gästerna kryssar i dem som passar dem; under Inbjudan ser ni hur många varje datum passar, och väljer ett – då hamnar festen i kalendern, de som röstade på det räknas som att de kommer, och de som bett om uppdateringar får ett mejl.",
          "Välj vad varje gäst får ta med: ingen, en +1 eller familjen – då lägger de till alla i sitt sällskap, var och en med allergier och om det är ett barn. En middag, en grillafton eller en utomhusaktivitet börjar med familjen.",
          "Välj ett tema för inbjudningssidan och ett för tacksidan – de som passar typen av fest först (ballonger, pirater och dinosaurier för kalas; disco, glitter, 80-tal och champagne för fest; bistro, jul och kräftskiva för middag; fotboll och hockey för match; grill, brännboll och badstrand utomhus). Eller skapa ett eget: färger, mönster, emoji och egna bilder överst och i bakgrunden – sparat att använda igen. En egen bild kan också ligga på inbjudan.",
          "Gäster som anger sin e-post och ber om uppdateringar får en bekräftelse, ett mejl om tid eller plats ändras, en påminnelse dagen innan och tacket – och de meddelanden ni skickar under Gäster. Det kräver serverns e-post, som serveradministratören ställer in under Server → Adress och tjänster.",
          "Festen läggs in i kalendern av sig själv – för alla den gäller (kryssa i en eller flera i familjen), och ni väljer vems önskelista som visas på inbjudan.",
          "Visa önskelistan: gästerna ser önskningarna för den festen gäller och bockar för vad de köper; den det gäller ser aldrig vem.",
          "Efteråt, under Tack: en tacktext och bilderna från ett album i Valvet, på samma sida som gästerna redan har.",
          "Bara de vuxna planerar fest – önskelistans reservationer finns i planeringen."
        ]
      }
    ]
  },
  "school": {
    "title": "Skolan",
    "summary": "Barnens skoldag från InfoMentor eller SchoolSoft via Home Assistant: skolkortet, skolans kalendrar och veckobrevet.",
    "blocks": [
      {
        "p": "Om familjen har kopplat Home Assistant kan barnens skola komma in i Smooth Family via gemenskapens integrationer för InfoMentor och SchoolSoft. Skolkortet på Idag visar varje barns skoldag, gympa nästa skoldag, fritidstiderna, läxor, frånvaro och vad som händer härnäst – och veckobrevet, som öppnas direkt där. Skolans kalendrar – schemat, prov och utflykter, fritids – kommer in i kalendern som barnets."
      },
      {
        "details": [
          {
            "title": "InfoMentor (rekommenderas)",
            "blocks": [
              {
                "steps": [
                  "I Home Assistant: öppna HACS → ⋮ → Anpassade arkiv, lägg till https://github.com/c14ym0re/infomentor-homeassistant av typen Integration och installera InfoMentor.",
                  "Starta om Home Assistant.",
                  "Inställningar → Enheter och tjänster → Lägg till integration → InfoMentor. Logga in med BankID (skanna QR-koden – än så länge bara för Stockholms stad) eller med e-post och lösenord om er kommun fortfarande har det klassiska InfoMentor-kontot.",
                  "Varje barn blir en enhet. I Smooth Family kryssar du i barnet under Familjemedlemmar → barnet → Skolan från Home Assistant."
                ]
              },
              {
                "note": "Den ger skoldagen, gympa, läxor, veckobrevet, frånvaro, fritidstiderna, skolans kalender och skolans nyheter – och lunchen om du anger skolans Mateo-enhet. En annan integration, https://github.com/chrfo892/ha-infomentor, ger schemat, incheckning på fritids och olästa notiser; den installeras på samma sätt."
              }
            ]
          },
          {
            "title": "SchoolSoft (schema och närvaro)",
            "blocks": [
              {
                "steps": [
                  "I HACS → ⋮ → Anpassade arkiv: lägg till https://github.com/chriseckl/Schoolsoft-for-Home-Assistant av typen Integration, installera den och starta om Home Assistant.",
                  "Inställningar → Enheter och tjänster → Lägg till integration → SchoolSoft, och logga in med vårdnadshavarens användarnamn och lösenord.",
                  "Lägg till den en gång per barn och kryssa sedan i varje barns konto i Smooth Family."
                ]
              },
              {
                "note": "Den ger schemat som kalender (lektioner märkta frånvarande eller sen), pågående och nästa lektion samt dagens start och slut. För matsedeln finns https://github.com/kanylbullen/ha-schoolsoft – skolans namn är det i skolans SchoolSoft-adress."
              }
            ]
          }
        ]
      },
      {
        "p": "Ett nytt veckobrev, frånvaro i dag och nyheter från skolan skickas till barnets vuxna som notiser. Barnets skola syns för barnets vuxna och för barnet själv; köksskärmen visar bara skoldagen, aldrig frånvaro eller brev."
      },
      {
        "tips": [
          "Lägg till kortet Skolan på Idag under Anpassa – och Skoldagen på köksskärmen under Familjeinställningar → Köksskärm om ni vill.",
          "Beta: integrationerna är små, inofficiella projekt, och deras sensorer känns igen på namnen (på engelska eller svenska). Saknas något – berätta vilka sensorer er integration har.",
          "En skolkalender kan också läggas till för hand under kalenderinställningarna med adressen homeassistant://calendar.namn.",
          "Kalendrar från Home Assistant kräver direktanslutning – de går inte att läsa via gatewayen."
        ]
      }
    ]
  },
  "health": {
    "title": "Hälsa",
    "summary": "Din träning och dagens steg, sömn och vikt – privat eller delat med familjen.",
    "blocks": [
      {
        "p": "Logga ett träningspass med några tryck – typ, minuter och sträcka om du vill – och dagens steg, sömn och vikt. Din sida visar de senaste fyra veckorna: minuter per dag, dina pass och hur många dagar i rad du har rört dig."
      },
      {
        "h": "Vem ser det"
      },
      {
        "p": "Allt är bara ditt tills du delar det, sort för sort: träning, steg, sömn och vikt, var och en med bara dig, de vuxna eller hela familjen. Andra ser det du delar i veckans översikt överst."
      },
      {
        "steps": [
          "Öppna Hälsa i menyn.",
          "Logga ett pass eller dagens värden.",
          "Under Vem ser din hälsa väljer du vad du delar och med vem."
        ]
      },
      {
        "h": "Tillsammans"
      },
      {
        "p": "En vuxen sätter familjens mål – timmar, kilometer eller pass mellan två datum, till exempel 500 km tillsammans i maj. De räknar träningen som var och en delar med familjen och syns i Hälsa, i söndagskollen och på köksskärmen (veckans rörelse). En uppgift kan bli klar genom träning: välj minst så många minuter den dagen, så bockas den av av sig själv när personens träning räcker – med poäng, som vilken uppgift som helst. Träning ger också utmärkelser."
      },
      {
        "tips": [
          "De vuxna ser alltid ett barns hälsa och kan fylla i den – en förälder kan logga fotbollsträningen.",
          "Ett barns vikt sparas inte, och vikt jämförs aldrig: den finns inte i översikten.",
          "Ladda ner din egen data som en fil, eller ta bort allt, längst ner på din sida."
        ]
      },
      {
        "h": "Från Home Assistant"
      },
      {
        "p": "Om familjen har kopplat Home Assistant kan steg, sömn, vikt och vilopuls hämtas från var och ens egna konton där: telefonen med följeslagarappen, en användare i Withings, Google Health, Garmin med flera. En familjeadmin kopplar kontona under Familjeinställningar → Familjemedlemmar → personen; personen slår sedan på Hämta min hälsa från Home Assistant i sin profil – ingenting hämtas innan dess. För ett barn slår en vuxen på det på barnets sida. De läses var 15:e minut och när du trycker Hämta nu, och sparas på dagen de gäller; det du själv fyller i på en dag vinner alltid, och ett barns vikt läses aldrig."
      },
      {
        "tips": [
          "Ett konto per person i Home Assistant: lägg till integrationen för Withings, Garmin eller Google Health en gång för var och en, med egen inloggning – och följeslagarappen på varje telefon.",
          "Steg och sömn från telefonen: installera Home Assistants följeslagarapp och slå på dess sensorer – på Android de för Health Connect (steg, sömn, puls, vikt …), på iPhone stegräknaren (steg).",
          "En våg eller en klocka: Withings har en egen integration i Home Assistant; Garmin, Fitbit, Oura med flera finns som integrationer från gemenskapen (HACS).",
          "Träningspass (beta): från Withings träningskalender eller en integrations sensor för senaste aktiviteter, som Garmin Connect eller Strava – de senaste två veckorna, varje pass en gång, även om det redan är loggat här för hand."
        ]
      }
    ]
  },
  "twohomes": {
    "title": "Två hem",
    "summary": "För barn som bor hos båda föräldrarna: schemat, överlämningar och den andra föräldern.",
    "blocks": [
      {
        "p": "Ställ in vilka dagar ett barn är i vilket hem – varannan vecka, 2-2-3, varannan helg eller egna dagar – och lägg till undantag för lov och bytta helger. Kalendern visar dagarna, och barnets uppgifter väntar medan barnet är i det andra hemmet."
      },
      {
        "shot": "twohomes",
        "caption": "Schemat mellan hemmen."
      },
      {
        "steps": [
          "Öppna Familjeinställningar → Familjemedlemmar → barnet.",
          "Välj barnet, mönstret och första dagen.",
          "Lägg till undantag när planerna ändras."
        ]
      },
      {
        "h": "Den andra föräldern"
      },
      {
        "p": "Den andra föräldern kan få ett eget konto som bara ser sitt barn: schemat, kalendern, nödkortet och överlämningslistan – och kan skriva med er. Eller skicka en länk som visar samma sak utan konto. Kostnader för barnets saker kan delas, så att den andra ser beloppet och sin del – aldrig bilder eller anteckningar."
      },
      {
        "tips": [
          "Kvällen före en överlämning påminns de vuxna, med överlämningslistan.",
          "Fliken Två hem syns i kalendern när ett schema är inställt."
        ]
      }
    ]
  },
  "week": {
    "title": "Söndagskollen",
    "summary": "En lugn stund varje vecka: blicka tillbaka, framåt och säga tack.",
    "blocks": [
      {
        "p": "Söndagskollen samlar familjen en gång i veckan. Blicka tillbaka på poängen och veckans bästa hjälpreda, framåt på kalendern, maten och vems tur det är – och ge varandra tack-stjärnor."
      },
      {
        "shot": "week",
        "caption": "Veckan som gått och veckan som kommer."
      },
      {
        "p": "Välj något att göra tillsammans och markera kollen som klar: alla får en kort sammanfattning. På söndagseftermiddagen påminns ni om ni inte gjort den."
      },
      {
        "h": "Planera veckan som kommer"
      },
      {
        "p": "Under veckan som kommer trycker du på Skjuts & packning vid en händelse för att ta en lämning eller hämtning och ge den en packlista. Skriv in en dags middag direkt – ett recepts namn tar med ingredienserna till inköpslistan – eller planera hela veckans mat därifrån."
      }
    ]
  },
  "chat": {
    "title": "Chatten",
    "summary": "Familjens egen chatt – med bilder, och bara för er.",
    "blocks": [
      {
        "p": "Skriv med hela familjen eller med en eller några. Bilder hamnar i chattens eget album i valvet. Meddelandena sparas på er server – ingen annan läser dem."
      },
      {
        "shot": "chat",
        "caption": "Meddelanden grupperade per person, med stora emojier."
      },
      {
        "tips": [
          "GIF:ar kan slås på av serverns admin; de kommer från GIPHY, det enda tillfället chatten når utanför.",
          "Olästa meddelanden visas som en siffra på chatten och som ett kort på Idag."
        ]
      }
    ]
  },
  "lists": {
    "title": "Listor",
    "summary": "Inköpslistor och att göra-listor som uppdateras för alla direkt.",
    "blocks": [
      {
        "p": "Gör så många listor ni behöver – maten, bygghandeln, packningen. Alla ser bockar och nya saker direkt, och listorna fungerar utan täckning. Byt namn på en lista med pennan bredvid namnet."
      },
      {
        "shot": "lists",
        "caption": "En inköpslista, delad och levande."
      },
      {
        "tips": [
          "Köpta varor kan läggas direkt i skafferiet med Lägg köpta varor i skafferiet.",
          "En lista kan skickas till Home Assistant, och därifrån till butikens app – se Inköpslistor i Home Assistant.",
          "Önskelistor och presentplanering är också listor – se Önskelistor och presenter."
        ]
      }
    ]
  },
  "wishes": {
    "title": "Önskelistor och presenter",
    "summary": "Allas önskelistor, hemlig presentplanering och en länk till mor- och farföräldrar.",
    "blocks": [
      {
        "p": "Alla i familjen har en önskelista. Lägg till en önskan med länk och pris – eller sök upp den på nätet. De andra planerar presenter i hemlighet: den som fyller år ser aldrig vem som köper vad."
      },
      {
        "shot": "wishes",
        "caption": "En önskelista med länkar."
      },
      {
        "h": "Dela med släkten"
      },
      {
        "p": "Skicka en länk till mor- och farföräldrar och andra utan konto. De ser önskelistan och kan markera vad de köper, så att inget köps två gånger – utan att barnet ser det."
      },
      {
        "tips": [
          "Sex veckor före en födelsedag påminns den som fyller år om att fylla i sin lista, och en månad före påminns de andra om att planera.",
          "Födelsedagar: en medlems på dennes sida under Familjemedlemmar; släkt och vänner under Familjemedlemmar → Andra personer."
        ]
      }
    ]
  },
  "food": {
    "title": "Maten och matsedeln",
    "summary": "Veckans middagar, recept från en länk och matlagningsläget.",
    "blocks": [
      {
        "p": "Planera veckans middagar under Mat. Hämta ett recept från en länk – de flesta receptsajter fungerar – eller klistra in texten om en sajt inte låter sig läsas. Ingredienserna kan läggas direkt på inköpslistan."
      },
      {
        "shot": "food",
        "caption": "Veckans middagar."
      },
      {
        "h": "Matlagningsläget"
      },
      {
        "p": "Tryck Laga på ett recept för stor text, ingredienser att bocka av och steg att trycka sig igenom. Håll skärmen tänd hindrar telefonen från att slockna medan händerna är kladdiga."
      },
      {
        "h": "Matlådor och helglunch"
      },
      {
        "p": "När du planerar veckan kan du bocka i Matlådor på vardagar och välja hur många per dag: middagen kvällen före blir då ett storkok – en gryta, en soppa eller en gratäng som håller och går att värma – och resterna blir nästa dags matlådor. Bocka i Lunch på lördag och söndag för helgens luncher också. Valet sparas till nästa vecka."
      },
      {
        "tips": [
          "Med den lokala AI:n kan veckans middagar föreslås åt er – utifrån det ni gillar och det ni har hemma.",
          "När middagen är klar bockar du av vad som gick åt, så räknas skafferiet ner av sig självt."
        ]
      }
    ]
  },
  "recipebook": {
    "title": "Receptboken",
    "summary": "Familjens recept med kategorier, favoriter och betyg från alla.",
    "blocks": [
      {
        "p": "Receptboken sparar familjens recept med kategorier, favoriter och länk till originalet. Alla i familjen ger sina egna stjärnor – barnen också – så ni ser vad som är populärt."
      },
      {
        "shot": "recipebook",
        "caption": "Recept med allas stjärnor."
      },
      {
        "p": "Kan lagas nu visar det som går att laga av det ni har i skafferiet. Sök nya recept på nätet via serverns egen sökmotor – bara sökorden lämnar servern."
      }
    ]
  },
  "pantry": {
    "title": "Skafferiet",
    "summary": "Det ni har i frysen, kylen och skafferiet – och det som bör ätas snart.",
    "blocks": [
      {
        "p": "Håll koll på vad ni har, var och till när. Det som snart går ut markeras och syns på Idag, så mindre mat slängs."
      },
      {
        "shot": "pantry",
        "caption": "Bäst före, per plats."
      },
      {
        "h": "Skanna in maten"
      },
      {
        "steps": [
          "Tryck Skanna in varor och håll upp varorna mot kameran en i taget – samma vara igen räknas upp.",
          "Kontrollera namn och mängder.",
          "Lägg allt på rätt plats på en gång."
        ]
      },
      {
        "tips": [
          "Uppslagning av streckkoder kan slås på under Familjeinställningar → Kopplingar; bara streckkoden skickas.",
          "Ett kvitto som den lokala AI:n läst kan också fylla skafferiet."
        ]
      }
    ]
  },
  "tasks": {
    "title": "Uppgifter och poäng",
    "summary": "Sysslor med poäng, turordning, godkännande – och efterrapportering.",
    "blocks": [
      {
        "p": "Uppgifter kan vara engångs eller återkomma varje dag, vissa veckodagar, varje månad eller varje år. Varje uppgift är värd poäng. Tryck Klar när den är gjord – barnens uppgifter kan vänta på att en vuxen godkänner dem."
      },
      {
        "shot": "tasks",
        "caption": "Dagens uppgifter med poäng."
      },
      {
        "h": "Turas om"
      },
      {
        "p": "Välj vilka som turas om på en uppgift: turen går vidare när den är gjord, eller varje vecka. Listan visar vem som står på tur."
      },
      {
        "h": "Glömt att bocka av?"
      },
      {
        "p": "Under Uppgifter → Idag stegar du bakåt med pilen – upp till tre dagar – och bockar av det som gjordes, med poäng som vanligt."
      },
      {
        "h": "Bockade av fel?"
      },
      {
        "p": "Tryck på bocken vid en klar uppgift för att ångra – poängen tas tillbaka. Ett barn kan ångra sina egna tills en vuxen har godkänt dem; en vuxen kan ångra alla. På köksskärmen trycker du på den klara uppgiften och bekräftar."
      },
      {
        "h": "Uppgifter från andra appar"
      },
      {
        "p": "Ett barns och ett husdjurs medicindoser blir uppgifter med poäng, och det gör även packningen inför en resa eller en händelse. En vuxen kan bocka av ett barns dos; poängen går ändå till barnet."
      },
      {
        "tips": [
          "Vilket schema som helst: varje dag eller varannan dag, valda veckodagar (vardagar, helg), med några veckors mellanrum, ett datum eller en veckodag i månaden (första lördagen), med några månaders mellanrum, en gång om året – med poäng. Husdjur, hemmet och fordonen har sina återkommande uppgifter med samma val.",
          "Barn kan föreslå uppgifter; en vuxen gör om dem till uppgifter eller tackar nej.",
          "Poängen går till butiken och veckopengen – se de ämnena.",
          "En uppgift som flera kan göra tillsammans delar poängen mellan dem som gjorde den: välj vilka när den bockas av.",
          "Tar du bort en uppgift finns poängen som redan tjänats in kvar – och gångerna den gjordes."
        ]
      }
    ]
  },
  "allowance": {
    "title": "Veckopeng och sparande",
    "summary": "Veckopeng från poäng eller ett mål, och spargrisar.",
    "blocks": [
      {
        "p": "Varje barn tjänar veckopeng antingen från poäng eller genom att nå ett veckomål – familjen väljer per barn. Utbetalningar noteras, så att alla ser vad som är betalt."
      },
      {
        "shot": "allowance",
        "caption": "Veckopengen och spargrisarna."
      },
      {
        "p": "Spargrisar delar upp pengarna: slösa, spara, ge eller ett eget mål. Ett barn kan föreslå ett sparmål med en del av veckopengen; en vuxen godkänner det."
      }
    ]
  },
  "shop": {
    "title": "Belöningsbutiken och prestationer",
    "summary": "Byt poäng mot belöningar, och lås upp prestationer.",
    "blocks": [
      {
        "p": "I butiken byter barnen sina poäng mot belöningar som de vuxna lagt in – en timme spel, välja fredagsmiddagen. Ett köp kan vänta på en vuxens godkännande. Familjemål är belöningar som hela familjen sparar till tillsammans."
      },
      {
        "shot": "shop",
        "caption": "Belöningar i butiken."
      },
      {
        "p": "Prestationer låses upp av sig själva – första uppgiften, en vecka i rad – och nivån växer med poängen."
      }
    ]
  },
  "littleones": {
    "title": "Lilla läget",
    "summary": "Stora bilder i stället för text, för barn som inte kan läsa än.",
    "blocks": [
      {
        "p": "I Lilla läget ser ett barn stora bildkort i stället för appen: morgon- och kvällsrutiner i ordning, förskoleväskan – tryck när det är gjort, för en liten fanfar och ett klistermärke."
      },
      {
        "shot": "littleones",
        "caption": "Rutiner för de minsta."
      },
      {
        "steps": [
          "Öppna Uppgifter → Lilla läget.",
          "Slå på läget för barnet – ett barn på 6 år eller yngre vars födelsedag angavs börjar med det påslaget.",
          "Börja från en färdig rutin eller gör en egen med bilder."
        ]
      },
      {
        "tips": [
          "En vuxen tar sig ur läget genom att hålla in låset och svara på ett tal.",
          "På köksskärmen kan varje barn öppna sina rutiner genom att trycka på sitt ansikte."
        ]
      }
    ]
  },
  "vault": {
    "title": "Valvet",
    "summary": "Foton, filer, dokument, kvitton och lösenord på ett ställe.",
    "blocks": [
      {
        "p": "Valvet sparar familjens foton, chattbilder, filer, dokument och kvitton – allt krypterat på er server. Filtrera per sort, sök, och markera något Bara jag så att ingen annan ser det."
      },
      {
        "shot": "vault",
        "caption": "Allt i valvet, med ett filter per sort."
      },
      {
        "h": "Dela med en länk"
      },
      {
        "p": "Allt i valvet kan delas med en länk som slutar fungera av sig själv – efter timmar eller dagar, eller när den öppnats en gång. Välj om mottagaren får ladda ner. Word, Excel och PowerPoint visas direkt i webbläsaren."
      },
      {
        "tips": [
          "Foton från samma dag tidigare år dyker upp som Minnen på Idag.",
          "Serverns admin bestämmer hur stor en fil får vara."
        ]
      }
    ]
  },
  "documents": {
    "title": "Dokument",
    "summary": "Pass, id-kort, försäkringar och avtal – med påminnelser innan de går ut.",
    "blocks": [
      {
        "p": "Spara familjens dokument med en skanning: pass, id-kort, körkort, försäkringar, garantier, avtal och vaccinationer. Nummer visas maskade och allt krypteras med familjens egen nyckel."
      },
      {
        "shot": "documents",
        "caption": "Dokument med utgångsdatum."
      },
      {
        "p": "Ett utgångsdatum ger en påminnelse i tid och syns i kalendern, så att passet förnyas före semestern."
      }
    ]
  },
  "passwords": {
    "title": "Lösenord",
    "summary": "Familjens gemensamma inloggningar, krypterade med familjens nyckel.",
    "blocks": [
      {
        "p": "Spara inloggningar i valvets vy Lösenord: streamingtjänsten, wifi:t, skolans plattform. De krypteras med familjens nyckel. En vuxen väljer vilka vuxna en inloggning delas med; barnen ser sina egna och de vuxna ser barnens."
      },
      {
        "shot": "passwords",
        "caption": "Inloggningar, med ett genererat lösenord."
      },
      {
        "tips": [
          "Skapa ett starkt lösenord med ett tryck.",
          "En inloggning som delas med en länk visas en gång – sedan slutar länken fungera."
        ]
      }
    ]
  },
  "receipts": {
    "title": "Kvitton",
    "summary": "Kvitton som den lokala AI:n läser, med påminnelser för retur och garanti.",
    "blocks": [
      {
        "p": "Fota ett kvitto eller välj en skärmdump, och koppla det till en bostad, ett fordon eller en kategori. Med den lokala AI:n läses butik, belopp och datum åt dig. Sista returdag och när garantin går ut ger påminnelser, och reklamationsrätten visas av sig själv."
      },
      {
        "shot": "receipts",
        "caption": "Kvitton med retur och garanti."
      },
      {
        "tips": [
          "Sök bland kvittona, se Året i siffror och exportera dem till Excel.",
          "Ett kvitto för ett barns saker kan delas med det andra hemmet.",
          "Den lokala AI:n kan skriva ett reklamationsbrev åt dig.",
          "På Android delar du ett kvitto från en annan app direkt till Smooth Family."
        ]
      }
    ]
  },
  "safety": {
    "title": "Nödkort och mediciner",
    "summary": "Det en barnvakt behöver veta, och mediciner med påminnelser.",
    "blocks": [
      {
        "p": "Nödkorten har det viktigaste om något händer: allergier, mediciner, vårdcentral, vem man ringer och rutiner – ett för varje person och ett för hemmet. De går att läsa även utan uppkoppling."
      },
      {
        "shot": "safety",
        "caption": "Nödkorten. En medlems kort och mediciner sköts på medlemmens sida under Familjeinställningar → Familjemedlemmar; hushållets kort under Vardagen."
      },
      {
        "h": "En barnvakt eller mor- och farföräldrar"
      },
      {
        "p": "Gör en gästlänk under Familjeinställningar → Familjemedlemmar: den visar nödkorten, och det du väljer av kalendern och listorna, i några timmar eller dagar – sedan slutar den av sig själv."
      },
      {
        "h": "Mediciner"
      },
      {
        "p": "Lägg till en medicin med dos, tider och ett slutdatum för en kur. Ett barns och ett husdjurs doser blir uppgifter med poäng; de vuxna får veta om en dos inte bockas av. En vuxens egna mediciner är privata – de läggs in under Min profil och ger inga poäng."
      }
    ]
  },
  "property": {
    "title": "Hemmet",
    "summary": "Underhåll, saker per rum, energi och projekt – per bostad.",
    "blocks": [
      {
        "p": "Varje bostad – huset, lägenheten, stugan – har ett eget kort med underhållet som ska göras, årets kostnader mot förra året, energin och de pågående projekten med budget mot vad som gått åt."
      },
      {
        "shot": "property",
        "caption": "Ett kort per bostad."
      },
      {
        "p": "Underhåll som återkommer – hängrännorna, filter, brandvarnaren – föreslås för sorts bostad, påminns i förväg och syns i kalendern; det kan också bli en uppgift. Saker per rum – vitvaror, värmepumpen – sparar märke, pris, manual och garanti."
      },
      {
        "tips": [
          "El, vatten och värme kan läsas från Home Assistants sensorer (bara läsa).",
          "Skriv ut en lista över saker och kvitton till hemförsäkringen."
        ]
      }
    ]
  },
  "economy": {
    "title": "Ekonomi",
    "summary": "Vart hushållets pengar går – med inkomster, budget och bankens fil.",
    "blocks": [
      {
        "p": "Ekonomi visar hushållets utgifter per kategori – mat, bostäderna, bilen, barnen, fritid. Kvitton och bostädernas, fordonens och resornas kostnader räknas in av sig själva. Varje vuxen lägger in sin egen inkomst, och översikten visar vad som kommer in, går ut och blir kvar."
      },
      {
        "shot": "economy",
        "caption": "Månaden per kategori."
      },
      {
        "h": "Importera från banken"
      },
      {
        "steps": [
          "Exportera kontots transaktioner som CSV från internetbanken.",
          "Ladda upp filen under Ekonomi → Importera från banken.",
          "Kontrollera förslaget för varje rad – bränsle till bilen, elräkningen till bostaden – och spara."
        ]
      },
      {
        "tips": [
          "En budget per kategori och månad blir röd när den spräcks.",
          "Poster kan vara privata, så att bara du ser dem."
        ]
      }
    ]
  },
  "vehicles": {
    "title": "Fordon",
    "summary": "Besiktning, service, däck, kostnader och förbrukning – för allt med motor eller hjul.",
    "blocks": [
      {
        "p": "Varje fordon har ett kort med det som är på gång – besiktning, service, däckbyte, försäkring och skatt – och årets kostnader. Påminnelser går på datum eller mätarställning, och nästa sätts när du markerar en som gjord."
      },
      {
        "shot": "vehicles",
        "caption": "Ett fordon med det som är på gång."
      },
      {
        "p": "Lägg in tankning eller laddning med liter eller kWh så räknas förbrukningen ut; laddning hemma använder dagens elpris. Spara däcksatserna med säsong och mönsterdjup, och gör en rapport till en köpare med servicehistoriken."
      },
      {
        "tips": [
          "Ett foto av kvittot eller en servicehistorik som PDF läses av den lokala AI:n.",
          "Mätarställningen kan läsas från en sensor i Home Assistant."
        ]
      }
    ]
  },
  "pets": {
    "title": "Husdjur",
    "summary": "Veterinärbesök, vaccinationer, sysslor och en födelsedag.",
    "blocks": [
      {
        "p": "Varje djur har sina veterinärbesök och vaccinationer, med påminnelse när de är dags, och en födelsedag bland födelsedagarna. Sysslor som promenader och matning blir uppgifter som barnen turas om på – och medicindoser följer samma turordning."
      },
      {
        "shot": "pets",
        "caption": "Ett husdjur med sin skötsel."
      }
    ]
  },
  "smarthome": {
    "title": "Smarta hemmet",
    "summary": "Lampor, värme och högtalare, flöden, vem som är hemma och elpriset.",
    "blocks": [
      {
        "p": "Med Home Assistant kopplat styr du hemmets enheter från Smooth Family – lampor, persienner, värmepumpen, robotdammsugaren, högtalare – per rum och per bostad. Familjens admin väljer vilka enheter som syns."
      },
      {
        "shot": "smarthome",
        "caption": "Enheter per rum."
      },
      {
        "h": "Flöden"
      },
      {
        "p": "Bygg egna automationer med När → Om → Gör: vid en tid, med en knapp på Idag, när en enhet ändras eller när någon kommer hem – till exempel tänd lampan på trappan när det mörknar. Flöden kan köras i Home Assistant självt, så att de fungerar medan Smooth Family startar om."
      },
      {
        "h": "Vem är hemma"
      },
      {
        "p": "Koppla familjen till personerna i Home Assistant, så väljer var och en att visa hemma eller borta – aldrig var du är. Inget sparas."
      },
      {
        "tips": [
          "Elpriset: ett kort på Idag med dagens timmar, och flöden som körs de billigaste timmarna.",
          "Ingen Home Assistant? Prova allt med det simulerade hemmet."
        ]
      }
    ]
  },
  "homeassistant": {
    "title": "Koppla Home Assistant",
    "summary": "Hemmets Home Assistant direkt – och andra hem via gatewayen.",
    "blocks": [
      {
        "p": "Home Assistant i samma hem som Smooth Family-servern kopplas direkt, med sin adress och en långlivad token. Ett annat hem – stugan – kopplas i stället via gatewayen, utan att någon port öppnas där."
      },
      {
        "steps": [
          "I Home Assistant: din profil → Säkerhet → Långlivade åtkomsttokens → Skapa token. Kopiera den.",
          "I Smooth Family: Familjeinställningar → Kopplingar → Smarta hemmet.",
          "Skriv adressen, t.ex. http://homeassistant.local:8123, och token, och tryck Anslut.",
          "Lägg till enheterna som ska synas, och koppla hemmet till rätt bostad."
        ]
      },
      {
        "shot": "homeassistant",
        "caption": "Hem och enheter under Familjeinställningar."
      },
      {
        "p": "Token sparas krypterad på servern. Smooth Family läser tillstånd och styr det du har lagt till; mätare och sensorer för energi och mätarställning läses bara."
      },
      {
        "tips": [
          "Använd en adress som fungerar från servern – en IP-adress är säkrast.",
          "Hostade familjer (på någon annans server) kopplar alltid via gatewayen."
        ]
      }
    ]
  },
  "gateway": {
    "title": "Gatewayen – Home Assistant i ett annat hem",
    "summary": "Stugans Home Assistant utan att öppna en port: som tillägg eller container.",
    "blocks": [
      {
        "p": "Gatewayen körs bredvid det andra hemmets Home Assistant och ringer upp er Smooth Family-server över HTTPS och håller linjen öppen. Ingen port öppnas där, och den fungerar bakom 4G-routrar. Home Assistant-token stannar i det hemmet; servern kan bara be om tillstånd och anrop i de tillåtna domänerna – lås och larm bara om du lägger till dem."
      },
      {
        "h": "1. Gör en kopplingskod"
      },
      {
        "p": "Familjeinställningar → Kopplingar → Smarta hemmet → Lägg till ett hem via tillägget. Ge det ett namn och välj bostad; koden på åtta tecken gäller i 24 timmar."
      },
      {
        "shot": "gateway",
        "caption": "Ett hem via gatewayen, med sin version."
      },
      {
        "h": "2. Installera – vilket sätt beror på Home Assistant"
      },
      {
        "p": "Inställningar → Om i Home Assistant visar installationstypen."
      },
      {
        "details": [
          {
            "title": "Home Assistant OS eller Supervised: som tillägg",
            "blocks": [
              {
                "steps": [
                  "Inställningar → Tillägg → Tilläggsbutik → ⋮ → Förråd, och lägg till https://github.com/burnwalled/smoothfamily.",
                  "Smooth Family syns i butiken: installera det.",
                  "Fyll i serverns adress och parkopplingskoden i alternativen och starta det."
                ]
              },
              {
                "p": "Tillägget använder Home Assistants egen token – ingen långlivad token behövs."
              }
            ]
          },
          {
            "title": "Home Assistant Container eller Core: som egen container",
            "blocks": [
              {
                "p": "Tillägg finns inte i de här installationerna, så gatewayen körs som en Docker-container bredvid Home Assistant, eller på en Raspberry Pi i det hemmet. Den behöver en långlivad token från din profil i Home Assistant."
              },
              {
                "steps": [
                  "Hämta gateway-mappen från https://github.com/burnwalled/smoothfamily och bygg dess image: docker build -t smooth-family-gateway gateway/",
                  "Starta den med SF_SERVER (serverns adress), SF_PAIRING_CODE, HA_URL och HA_TOKEN, och en volym för /data.",
                  "Loggen säger Paired as … och sedan Connected to …."
                ]
              }
            ]
          }
        ]
      },
      {
        "h": "3. Uppdateringar"
      },
      {
        "p": "Gatewayen uppdaterar sig själv från er server – påslaget som standard. Den kör bara versioner som signerats på datorn där releaserna görs; inte ens den som tog över servern skulle kunna köra något i stugan. Om en ny version inte ansluter kommer den förra tillbaka av sig själv. Hemmet visar Senaste versionen när den är aktuell."
      },
      {
        "tips": [
          "Byter du gatewayens dator, eller kan nyckeln ha läckt? Gör en ny kod – den gamla nyckeln slutar fungera direkt.",
          "Om linjen är nere misslyckas ett kommando direkt i stället för att köras sent."
        ]
      }
    ]
  },
  "halists": {
    "title": "Inköpslistor i Home Assistant",
    "summary": "Skicka en lista till Home Assistant – och därifrån till ICA:s eller Coops app.",
    "blocks": [
      {
        "p": "En lista kan skickas till en av Home Assistants att göra-listor, eller kopplas till en så att båda hålls lika. Med en butiks integration installerad i Home Assistant syns listan sedan i butikens egen app. Det som köps där bockas av här och hamnar under Nyköpt i skafferiet."
      },
      {
        "steps": [
          "Installera butikens integration i Home Assistant (länkar i dialogen – gjorda av andra, på egen risk).",
          "Öppna listan i Smooth Family → Home Assistant.",
          "Välj att göra-listan, och skicka en gång eller koppla listorna."
        ]
      },
      {
        "note": "Nytt och inte fullt testat med butikerna än: det fungerar så bra som butikens integration synkar tillbaka bockarna."
      }
    ]
  },
  "kiosk": {
    "title": "Köksskärmen",
    "summary": "En surfplatta på väggen med familjens dag.",
    "blocks": [
      {
        "p": "Koppla en surfplatta med en egen länk eller QR-kod. Den visar familjens dag: dagens och morgondagens kalender med vem som kör, vem som är hemma, vädret, uppgifterna, middagen och skolmaten, sophämtningen och elpriset – och en knapp för nödkortet. Inget privat visas, och skärmen har inget konto."
      },
      {
        "shot": "kiosk",
        "caption": "Köksskärmen."
      },
      {
        "h": "På skärmen"
      },
      {
        "p": "Uppgifter bockas av direkt där, med stora rader för fingrar: tryck på en, sedan på ditt ansikte – för en uppgift ni gjort tillsammans, alla som hjälpte till, och poängen delas. Veckans mat och receptboken öppnar matlagningsläget: receptet i stor stil, ingredienser att bocka av och stegen ett i taget. De smarta enheter som valts för skärmen styrs med ett tryck."
      },
      {
        "h": "Skärmsläckaren"
      },
      {
        "p": "Efter de minuter du väljer kommer skärmsläckaren: familjens foton, en flip-klocka, en lugn klocka med vädret, en mörk skärm – eller räven, som visar vädret ute. Den läser när det är grått, flyger drake när molnen drar förbi, håller paraplyet i regnet, bygger snögubbe när det snöar och sover på natten, och dagens uppgifter syns över sjön. Ett tryck väcker skärmen."
      },
      {
        "p": "Med några minuters mellanrum gör räven något litet som passar vädret – skuttar, plaskar i en vattenpöl, kastar snöboll, tittar på ett stjärnfall – och ibland skuttar en hare förbi eller en fisk hoppar i sjön. Den klär ut sig till halloween, jul, nyår, påsk och midsommar, och på en födelsedag (personerna under Födelsedagar) får den ballonger, partyhatt och en banderoll med namnet. Högtiderna följer familjens land; utklädnaden stängs av per skärm under skärmsläckaren. Med minskade rörelser på surfplattan står räven still."
      },
      {
        "steps": [
          "Familjeinställningar → Köksskärm → Koppla en skärm.",
          "Öppna länken på surfplattan (eller skanna QR-koden) och lägg till den på hemskärmen.",
          "Under skärmen väljer du vad den visar, skärmsläckare, färger, språk och natt."
        ]
      },
      {
        "tips": [
          "Allt om en skärm finns under Familjeinställningar → Köksskärm: namnet, skärmsläckaren (med en bild av varje), vad den visar, färger och språk, när den dämpas på natten, vilka smarta enheter den får styra och vad den får göra. En knapp ger alla skärmar samma inställningar, och en skärm hämtar en ändring inom en minut.",
          "Veckans mat och receptboken väljs per skärm – de är avslagna tills du slår på dem.",
          "Ett lås visas aldrig på skärmen, vad du än väljer.",
          "En borttappad länk ersätts med Ny länk; Koppla bort stänger länken helt.",
          "De små kan öppna sina bildrutiner där genom att trycka på sitt ansikte.",
          "Helskärm med knappen i hörnet (på en iPad lägger du i stället till skärmen på hemskärmen)."
        ]
      }
    ]
  },
  "localai": {
    "title": "Den lokala AI:n",
    "summary": "En AI på en dator hemma – för kvitton, recept och förslag.",
    "blocks": [
      {
        "p": "Smooth Family kan använda en AI som körs på en dator i ert hem med Ollama. Den läser kvitton och servicehistorik, gör om text eller ett foto till ett recept, föreslår veckans middagar och sysslor, och svarar på frågor med webbsökning. Inget skickas till någon extern tjänst."
      },
      {
        "shot": "localai",
        "caption": "Jobb för den lokala AI:n."
      },
      {
        "p": "Serverns admin ställer in den en gång (Serverinställningar → AI-datorn) – den behöver en dator med ett hyfsat grafikkort. Sedan väljer varje familj att slå på den. Jobben köas, så datorn kan sova och väckas när det finns något att göra."
      },
      {
        "tips": [
          "Allt AI:n föreslår visas för dig innan det sparas.",
          "Utan AI:n kan du fortfarande kopiera frågan till en AI du själv väljer."
        ]
      }
    ]
  },
  "websearch": {
    "title": "Söka på nätet",
    "summary": "Sök via serverns egen sökmotor – bara orden lämnar servern.",
    "blocks": [
      {
        "p": "När serverns admin har slagit på sökningen kan du söka på nätet från Smooth Family: efter önskningar och presenter, recept, manualer till saker i hemmet, fakta om bilen och saker att hitta på. Sökningen körs på er egen server (SearXNG), så bara sökorden lämnar den – inte vem som frågar."
      },
      {
        "p": "Med den lokala AI:n kan du också ställa en fråga och få ett svar med källor från nätet."
      }
    ]
  },
  "family": {
    "title": "Familjeinställningar",
    "summary": "Medlemmar, vilka appar var och en ser, och familjens vardag.",
    "blocks": [
      {
        "p": "Familjeinställningarna är för den som sköter familjen. Admin lägger till medlemmar och väljer vilka appar var och en ser; en vuxen som admin litar på kan få ändra vardagsinställningarna också."
      },
      {
        "shot": "family",
        "caption": "Alla i familjen; öppna en för allt om personen."
      },
      {
        "h": "En medlems egen sida"
      },
      {
        "p": "Tryck på en medlem för allt om personen på ett ställe: namn, färg och bild, nytt lösenord och återställning av tvåstegsinloggning, vilka appar personen använder – och för ett barn språket i appen, födelsedagen, Lilla läget, veckopengen, medicinen och nödkortet. En vuxens egna mediciner förblir privata, och vuxna väljer sin egen bild."
      },
      {
        "h": "Vad finns var"
      },
      {
        "p": "Familjemedlemmar: alla, var och en med en egen sida (inloggning, appar, språk, bild – och för ett barn födelsedag, veckopeng, Lilla läget, två hem, medicin och nödkort), andra personer utan konto för deras födelsedagar, och gästlänkar för barnvakten eller mor- och farföräldrar. Vardagen: kalendrar, hemmet, Idags källor, poängreglerna, hushållets nödkort och husdjurens medicin. Köksskärm. Familjemedlemmar: smarta hemmet och den lokala AI:n. Säkerhet och data: backuper och export."
      },
      {
        "tips": [
          "Ange ett barns födelsedag när du lägger till det – ett barn på 6 år eller yngre börjar i Lilla läget.",
          "Familjens kom igång-guide kan öppnas igen högst upp i Familjeinställningar.",
          "En ny medlem börjar med administratörens språk; en förälder ändrar barnets på barnets sida."
        ]
      }
    ]
  },
  "familydata": {
    "title": "Familjens data och backuper",
    "summary": "Export, familjens egen backupnyckel och att flytta familjen.",
    "blocks": [
      {
        "p": "Under Familjeinställningar → Säkerhet och data kan admin exportera familjens data och, på en hostad server, välja en egen backupnyckel för familjen: familjens backuper förseglas då så att bara ni kan öppna dem – inte ens serverns admin."
      },
      {
        "shot": "familydata",
        "caption": "Familjens backuper och nyckel."
      },
      {
        "tips": [
          "Förvara nyckeln utanför servern, som ett viktigt lösenord – utan den går backuperna inte att återställa.",
          "Loggen visar inloggningar och ändringar i familjen."
        ]
      }
    ]
  },
  "profile": {
    "title": "Min profil",
    "summary": "Ditt namn, bild, språk, meny, notiser och säkerhet.",
    "blocks": [
      {
        "p": "Min profil har fyra flikar. Om mig: namn, bild, språk och tema, ditt nödkort och dina egna mediciner. Meny: apparnas ordning och vilka som är dolda. Notiser: vad som skickas, och morgonsammanfattningen. Säkerhet och kopplingar: lösenord, passkeys, tvåstegskoder och din mobilkalender."
      },
      {
        "shot": "profile",
        "caption": "Min profil."
      }
    ]
  },
  "server": {
    "title": "Serverinställningar",
    "summary": "För den som sköter servern: familjer, inloggningsregler, adressen och loggen.",
    "blocks": [
      {
        "p": "Serverns admin bestämmer det som är lika för alla familjer på servern. Bjud in andra familjer med en länk – de kan prova en demo först – och pausa, flytta eller ta bort en familj. Admin ser aldrig familjernas innehåll."
      },
      {
        "shot": "server",
        "caption": "Familjerna på servern."
      },
      {
        "p": "Säkerhet sätter reglerna för passkeys, tvåstegskoder och hur långa lösenord ska vara. Adress och tjänster har serverns adress på internet, sökningen och tjänsterna för alla familjer. Serverns kom igång-guide kan öppnas igen högst upp."
      }
    ]
  },
  "serverbackups": {
    "title": "Backuper och backupnyckeln",
    "summary": "Backup varje natt, förseglad med en nyckel bara du har.",
    "blocks": [
      {
        "p": "Servern gör en backup varje natt och sparar 30 dagar. Med en backupnyckel förseglas de: servern kan göra dem men aldrig läsa dem, och nyckeln räcker för att få tillbaka allt på en ny server."
      },
      {
        "shot": "serverbackups",
        "caption": "Backuper, förseglade med nyckeln."
      },
      {
        "steps": [
          "Serverinställningar → Säkerhetskopior och flytt → Skapa backupnyckel. Nyckeln skapas i din webbläsare; servern får bara dess publika halva.",
          "Spara den i en lösenordshanterare, skriv ut den eller ladda ner den – och bekräfta med de sista tecknen.",
          "Prova nyckeln mot den senaste backupen med Prova min nyckel."
        ]
      },
      {
        "note": "Utan nyckeln går backuperna inte att återställa, och ingen kan ta fram den åt dig igen."
      }
    ]
  },
  "serverupdates": {
    "title": "Uppdateringar",
    "summary": "Smooth Family och serverns delar, av sig själva – och gatewayernas versioner.",
    "blocks": [
      {
        "p": "Databasen, Redis, webbservern och sökmotorn får säkerhetsfixar mellan Smooth Familys releaser. Välj om de läggs in av sig själva i ett veckofönster eller efter ditt godkännande. En backup görs först, och om de nya versionerna inte kommer upp läggs de gamla tillbaka."
      },
      {
        "shot": "serverupdates",
        "caption": "Versioner, fönstret och gatewayerna."
      },
      {
        "h": "Smooth Family själv"
      },
      {
        "p": "Välj en kanal under Smooth Family själv, så uppdaterar servern även appen, samtidigt som resten: Stabil följer releaserna, Beta varje ändring så fort den är klar. Bara versioner som projektet har signerat läggs in, databasen sparas först, och om den nya versionen inte startar kommer den gamla och dess databas tillbaka. Avstängt tills du väljer – att leta är ett anrop till GitHub."
      },
      {
        "p": "Kortet Gatewayer visar varje gateway på servern, versionen var och en rapporterade och om den uppdaterar sig själv – så att du ser att alla är aktuella."
      },
      {
        "note": "Serverns update.sh behöver schemaläggas varje timme en gång (på en Synology: Schemaläggaren, användare root) för att uppdateringar ska läggas in."
      }
    ]
  },
  "serverservices": {
    "title": "Tjänster, lokal AI och sökning",
    "summary": "Serverns adress, sökmotorn, den lokala AI:n och andra tjänster.",
    "blocks": [
      {
        "p": "Adress och tjänster har adressen servern nås på – den används i alla länkar som skickas – receptsökningen och webbsökningen (SearXNG på servern själv), Home Assistant för hostade familjer via gatewayen, GIF:ar i chatten och att skicka feedback. AI-datorn ställer in var Ollama körs, vilka modeller som används, och väckning och viloläge för datorn. E-post ställer in e-posttjänsterna – Gmail med ett app-lösenord, Brevo för en adress på er egen domän eller en annan SMTP-server – vilken er familj skickar med, och om de hostade familjerna också får skicka e-post (till festgäster som bett om uppdateringar)."
      },
      {
        "shot": "serverservices",
        "caption": "Serverns tjänster."
      }
    ]
  },
  "feedback": {
    "title": "Rapportera ett problem",
    "summary": "Något som är fel, eller ett önskemål – till serverns administratör.",
    "blocks": [
      {
        "p": "Hittat något som inte fungerar, eller önskar du något nytt? Skriv det under Rapportera ett problem i profilmenyn. Det går till den som sköter servern, med sidan du var på och din webbläsare, och en skärmbild om du lägger till en."
      },
      {
        "steps": [
          "Öppna profilmenyn → Rapportera ett problem.",
          "Välj Något är fel eller Önskemål, och skriv vad som hände eller vad du vill ha.",
          "Lägg till en skärmbild om det hjälper – klistra in, släpp den eller ta ett foto."
        ]
      },
      {
        "tips": [
          "Du ser dina rapporter på samma sida: mottagen, planerad, åtgärdad eller inte planerad – med en rad från serveradministratören när det finns en.",
          "Du får en notis när en rapports status ändras.",
          "Familjens administratör ser hela familjens rapporter."
        ]
      }
    ]
  },
  "devices": {
    "title": "Enheter",
    "summary": "Vad som är anslutet med familjens konto, och om det mår bra.",
    "blocks": [
      {
        "p": "Familjeinställningar → Enheter visar vad som pratar med servern för familjen: mobilerna och datorerna medlemmarna loggar in på, köksskärmarna och gatewayerna – som Home Assistant-appen eller en egen container. En karta placerar dem runt servern; listan har var och ens version, när den senast sågs och hur den mår."
      },
      {
        "shot": "devices",
        "caption": "Familjens enheter runt servern."
      },
      {
        "h": "Hälsa"
      },
      {
        "p": "Grön: mår bra. Orange: en gammal version – en app som ska öppnas igen eller en gateway att uppdatera. Grå: en medlems enhet som inte använts på ett tag. Röd: en köksskärm eller gateway som inte är där. Under en enhet som inte mår bra står det i listan vad du gör."
      },
      {
        "tips": [
          "En enhet som inte setts på 7 dagar försvinner från kartan men finns kvar i listan; en medlems gamla mobil kan glömmas där.",
          "Bara typen av enhet, webbläsare och system, appversionen och när den senast användes sparas – ingen adress, ingen plats.",
          "Serveradministratören ser era enheter som typer, aldrig namn, och kan be er se över en."
        ]
      }
    ]
  },
  "serverreports": {
    "title": "Rapporter från familjerna",
    "summary": "Läs, svara på och skicka vidare fel och önskemål.",
    "blocks": [
      {
        "p": "Alla familjers rapporter om fel och önskemål kommer till Serverinställningar → Rapporter, och du får en notis. Öppna en för att läsa den med sida, webbläsare och skärmbild; sätt status – mottagen, planerad, åtgärdad eller inte planerad – och skriv en rad till rapportören, som får veta det."
      },
      {
        "h": "Till projektet"
      },
      {
        "p": "Bocka i de rapporter som Smooth Family-projektet bör känna till och tryck på Exportera. Du får en anonym text – vad och var, aldrig vem eller vilken familj – och GitHubs formulär i projektets publika repo öppnas ifyllt med den och etiketten from-server-admin. Läs igenom och tryck på Create där. En text som är för lång för länken kopieras så att du kan klistra in den."
      },
      {
        "tips": [
          "Servern skickar ingenting: exporten öppnar bara GitHub i din webbläsare.",
          "Exporterade rapporter märks, så att du inte skickar dem två gånger."
        ]
      }
    ]
  },
  "serverdevices": {
    "title": "Familjernas enheter",
    "summary": "Varje familjs enheter per typ, deras versioner och hälsa.",
    "blocks": [
      {
        "p": "Serverinställningar → Enheter placerar servern i mitten med varje familj runt sig, och runt varje familj dess typer av enheter: mobiler, surfplattor, datorer, köksskärmar, gatewayer och Home Assistant-appar. Du ser hur många, vilka versioner de kör och om de mår bra – aldrig vems de är eller vad de heter."
      },
      {
        "p": "Appens version är serverns egen; en gateway ska köra den senaste som servern delar ut. När en familj har en enhet med gammal version eller en som inte är där skickar Be familjen se över en notis till familjens administratörer om vilka typer och varför."
      },
      {
        "tips": [
          "En enhet som inte setts på 7 dagar försvinner från kartan.",
          "En gateway uppdaterar sig själv om automatisk uppdatering är på – en gammal betyder oftast att den är avstängd."
        ]
      }
    ]
  }
};

export default texts;
