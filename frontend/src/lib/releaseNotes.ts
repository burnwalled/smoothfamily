// "What's new": one entry per release, newest first, in every UI language.
// Add an entry for each release; the profile menu shows a dot until the user has opened the page.
import { Locale } from "@/lib/i18n";

export type ReleaseNote = {
  version: string;
  date: string; // YYYY-MM-DD
  items: Record<Locale, string[]>;
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "3.2.1",
    date: "2026-11-02",
    items: {
      sv: ["Installationen från GitHub fungerar nu direkt: skriptet stannade på ett fel, fick inte köras på Linux och fyllde inte i alla hemligheter. Det skapar nu också en uppsättningskod så att ingen annan kan ta över en ny server.", "Fälten när familjen skapas är kopplade till sina rubriker, så att skärmläsare läser upp dem.", "Sidan Smarta hemmet frågar inte längre efter en simulerad hemmiljö som inte finns."],
      en: ["Installing from GitHub now works straight away: the script stopped on an error, couldn't be run on Linux and didn't fill in every secret. It now also makes a setup code, so nobody else can claim a new server.", "The fields where the family is created are tied to their labels, so screen readers read them out.", "The Smart home page no longer asks for a simulated home that isn't there."],
      nb: ["Installasjonen fra GitHub fungerer nå med en gang: skriptet stoppet på en feil, kunne ikke kjøres på Linux og fylte ikke inn alle hemmeligheter. Det lager nå også en oppsettkode, så ingen andre kan ta over en ny server.", "Feltene der familien opprettes, er koblet til overskriftene sine, så skjermlesere leser dem opp.", "Smarthjem-siden spør ikke lenger etter et simulert hjem som ikke finnes."],
      da: ["Installationen fra GitHub virker nu med det samme: scriptet stoppede ved en fejl, kunne ikke køres på Linux og udfyldte ikke alle hemmeligheder. Det laver nu også en opsætningskode, så ingen andre kan overtage en ny server.", "Felterne, hvor familien oprettes, er knyttet til deres overskrifter, så skærmlæsere læser dem op.", "Siden Smart hjem spørger ikke længere efter et simuleret hjem, der ikke findes."],
      fi: ["Asennus GitHubista toimii nyt heti: skripti pysähtyi virheeseen, sitä ei voinut ajaa Linuxissa eikä se täyttänyt kaikkia salaisuuksia. Nyt se tekee myös asennuskoodin, jottei kukaan muu voi ottaa uutta palvelinta haltuunsa.", "Perheen luomisen kentät on liitetty otsikkoihinsa, joten ruudunlukijat lukevat ne.", "Älykoti-sivu ei enää kysy simuloitua kotia, jota ei ole."],
    },
  },
  {
    version: "3.2.0",
    date: "2026-11-02",
    items: {
      sv: ["Planera matlådor: bocka i Matlådor på vardagar när du planerar veckans mat, så blir middagen kvällen före ett storkok som räcker till nästa dags lunch. Lunch på helgen kan planeras också, och valen sparas till nästa vecka.", "I Söndagskollen sätter du vem som kör och packlistan direkt vid varje händelse, och skriver in veckans middagar – ett recepts namn tar med ingredienserna. Därifrån når du också hela matplaneringen.", "Kalendern: Skjuts & packning är nu en tydlig knapp vid varje händelse, lika stor som Ändra, och raden öppnar inte längre redigeringen av misstag.", "Söndagskollen heter Sunday check-in på engelska, Søndagsmøtet på norska, Søndagsmødet på danska och Sunnuntaikatsaus på finska."],
      en: ["Plan lunchboxes: tick Lunchboxes on weekdays when you plan the week's food, and the dinner the evening before becomes a big batch that covers the next day's lunch. Weekend lunches can be planned too, and the choices are remembered for next week.", "In the Sunday check-in you set who drives and the packing list right by each event, and write in the week's dinners – a recipe's name brings its ingredients. The whole meal planning is a tap away from there.", "Calendar: Rides & packing is now a clear button by each event, as big as Edit, and the row no longer opens the editor by mistake.", "Söndagskollen is now called the Sunday check-in in English."],
      nb: ["Planlegg matpakker: kryss av for Matpakker på hverdager når du planlegger ukens mat, så blir middagen kvelden før en stor porsjon som rekker til neste dags lunsj. Lunsj i helgen kan også planlegges, og valgene huskes til neste uke.", "På søndagsmøtet setter du hvem som kjører og pakkelisten rett ved hver hendelse, og skriver inn ukens middager – navnet på en oppskrift tar med ingrediensene. Hele matplanleggingen er ett trykk unna derfra.", "Kalenderen: Kjøring og pakking er nå en tydelig knapp ved hver hendelse, like stor som Rediger, og raden åpner ikke lenger redigeringen ved et uhell.", "Söndagskollen heter nå Søndagsmøtet på norsk."],
      da: ["Planlæg madpakker: kryds af i Madpakker på hverdage, når du planlægger ugens mad, så bliver aftensmaden aftenen før en stor portion, der rækker til næste dags frokost. Frokost i weekenden kan også planlægges, og valgene huskes til næste uge.", "Til søndagsmødet sætter du, hvem der kører, og pakkelisten direkte ved hver begivenhed, og skriver ugens aftensmad ind – en opskrifts navn tager ingredienserne med. Hele madplanlægningen er et tryk væk derfra.", "Kalenderen: Kørsel og pakning er nu en tydelig knap ved hver begivenhed, lige så stor som Rediger, og rækken åbner ikke længere redigeringen ved en fejl.", "Söndagskollen hedder nu Søndagsmødet på dansk."],
      fi: ["Suunnittele eväslaatikot: valitse Eväslaatikot arkipäivinä, kun suunnittelet viikon ruokia, niin edellisillan päivällinen tehdään isona satsina, joka riittää seuraavan päivän lounaaksi. Myös viikonlopun lounaat voi suunnitella, ja valinnat muistetaan ensi viikkoon.", "Sunnuntaikatsauksessa merkitset kyydit ja pakkauslistan suoraan kunkin tapahtuman kohdalla ja kirjoitat viikon päivälliset – reseptin nimi tuo sen ainekset. Koko ruokasuunnittelu on sieltä yhden napautuksen päässä.", "Kalenteri: Kyydit ja pakkaus on nyt selvä painike jokaisen tapahtuman vieressä, yhtä iso kuin Muokkaa, eikä rivi enää avaa muokkausta vahingossa.", "Söndagskollen on nyt suomeksi Sunnuntaikatsaus."],
    },
  },
  {
    version: "3.1.1",
    date: "2026-11-02",
    items: {
      sv: ["Bockade du av fel uppgift? Tryck på bocken för att ångra – poängen tas tillbaka. På köksskärmen trycker du på den klara uppgiften och bekräftar. Ett barn kan ångra sina egna tills en vuxen har godkänt dem.", "Alla sidor, även köksskärmen och inställningarna, visar nu direkt det de visade senast och uppdateras av sig själva när något ändras. Köksskärmen fortsätter visa sin senaste bild om uppkopplingen försvinner, även efter en omstart."],
      en: ["Ticked off the wrong task? Tap the tick to undo it – the points go back. On the kitchen display, tap the done task and confirm. A child can undo their own until an adult has approved it.", "Every page, the kitchen display and the settings included, now shows what it showed last right away and refreshes by itself when something changes. The kitchen display keeps showing its last picture if the connection goes, even after a restart."],
      nb: ["Krysset du av feil oppgave? Trykk på haken for å angre – poengene trekkes tilbake. På kjøkkenskjermen trykker du på den ferdige oppgaven og bekrefter. Et barn kan angre sine egne til en voksen har godkjent dem.", "Alle sider, også kjøkkenskjermen og innstillingene, viser nå med en gang det de viste sist og oppdateres av seg selv når noe endres. Kjøkkenskjermen fortsetter å vise sitt siste bilde hvis forbindelsen blir borte, også etter en omstart."],
      da: ["Krydsede du den forkerte opgave af? Tryk på fluebenet for at fortryde – pointene trækkes tilbage. På køkkenskærmen trykker du på den færdige opgave og bekræfter. Et barn kan fortryde sine egne, indtil en voksen har godkendt dem.", "Alle sider, også køkkenskærmen og indstillingerne, viser nu straks det, de viste sidst, og opdaterer sig selv, når noget ændres. Køkkenskærmen bliver ved med at vise sit seneste billede, hvis forbindelsen forsvinder, også efter en genstart."],
      fi: ["Merkitsitkö väärän tehtävän? Peru se napauttamalla merkkiä – pisteet otetaan takaisin. Keittiönäytöllä napauta tehtyä tehtävää ja vahvista. Lapsi voi perua omansa, kunnes aikuinen on hyväksynyt ne.", "Kaikki sivut, myös keittiönäyttö ja asetukset, näyttävät nyt heti sen, mitä ne näyttivät viimeksi, ja päivittyvät itsestään, kun jokin muuttuu. Keittiönäyttö näyttää viimeisimmän kuvansa, jos yhteys katkeaa, myös uudelleenkäynnistyksen jälkeen."],
    },
  },
  {
    version: "3.1.0",
    date: "2026-11-02",
    items: {
      sv: ["Rapporter om fel och önskemål går nu till serverns administratör i stället för GitHub. Du ser när din rapport är mottagen, planerad eller åtgärdad – med en rad från administratören – och ingen GitHub-token behövs längre.", "Serveradministratören läser alla rapporter under Serverinställningar → Rapporter, sätter status och kan ta de valda till Smooth Familys publika repo: en anonym text utan namn och familjer fylls i GitHubs formulär.", "Familjeinställningar → Enheter: vilka mobiler, datorer, köksskärmar och gatewayer som är anslutna till familjen, på en karta runt servern och i en lista – med version och hälsa och vad du gör när något inte mår bra.", "Serveradministratören ser varje familjs enheter som typer (inga namn), med versioner, och kan be en familj se över en enhet via notiscentret.", "Gatewayen 1.3.0 berättar om den körs som Home Assistant-appen eller som en egen container."],
      en: ["Reports of problems and wishes now go to the server's admin instead of GitHub. You see when yours is received, planned or fixed – with a line from the admin – and no GitHub token is needed any more.", "The server admin reads every report under Server settings → Reports, sets their status and can take the chosen ones to Smooth Family's public repository: an anonymous text without names or families fills in GitHub's form.", "Family settings → Devices: which phones, computers, kitchen displays and gateways are connected to the family, on a map around the server and in a list – with their version and health, and what to do when one isn't well.", "The server admin sees each family's devices as kinds (no names), with their versions, and can ask a family to look after a device through the notification centre.", "Gateway 1.3.0 tells whether it runs as the Home Assistant app or as a container of its own."],
      nb: ["Rapporter om feil og ønsker går nå til serverens administrator i stedet for GitHub. Du ser når rapporten din er mottatt, planlagt eller fikset – med en linje fra administratoren – og ingen GitHub-token trengs lenger.", "Serveradministratoren leser alle rapporter under Serverinnstillinger → Rapporter, setter status og kan ta de valgte til Smooth Familys offentlige repo: en anonym tekst uten navn og familier fylles inn i GitHubs skjema.", "Familieinnstillinger → Enheter: hvilke mobiler, datamaskiner, kjøkkenskjermer og gatewayer som er koblet til familien, på et kart rundt serveren og i en liste – med versjon og helse, og hva du gjør når noe ikke står bra til.", "Serveradministratoren ser hver families enheter som typer (ingen navn), med versjoner, og kan be en familie se til en enhet via varslingssenteret.", "Gatewayen 1.3.0 forteller om den kjører som Home Assistant-appen eller som en egen container."],
      da: ["Rapporter om fejl og ønsker går nu til serverens administrator i stedet for GitHub. Du ser, når din rapport er modtaget, planlagt eller rettet – med en linje fra administratoren – og der skal ikke længere bruges en GitHub-token.", "Serveradministratoren læser alle rapporter under Serverindstillinger → Rapporter, sætter status og kan tage de valgte til Smooth Familys offentlige repo: en anonym tekst uden navne og familier udfylder GitHubs formular.", "Familieindstillinger → Enheder: hvilke mobiler, computere, køkkenskærme og gateways der er forbundet med familien, på et kort rundt om serveren og i en liste – med version og helbred, og hvad du gør, når noget ikke har det godt.", "Serveradministratoren ser hver families enheder som typer (ingen navne), med versioner, og kan bede en familie se efter en enhed via notifikationscentret.", "Gateway 1.3.0 fortæller, om den kører som Home Assistant-appen eller som sin egen container."],
      fi: ["Virhe- ja toiveraportit menevät nyt palvelimen ylläpitäjälle GitHubin sijaan. Näet, kun raporttisi on vastaanotettu, suunnitteilla tai korjattu – ylläpitäjän rivin kera – eikä GitHub-tunnusta enää tarvita.", "Palvelimen ylläpitäjä lukee kaikki raportit kohdassa Palvelimen asetukset → Raportit, asettaa niiden tilan ja voi viedä valitut Smooth Familyn julkiseen repoon: nimetön teksti ilman nimiä ja perheitä täyttää GitHubin lomakkeen.", "Perheen asetukset → Laitteet: mitkä puhelimet, tietokoneet, keittiön näytöt ja yhdyskäytävät ovat yhteydessä perheeseen, kartalla palvelimen ympärillä ja listana – versioineen ja kuntoineen, ja mitä tehdä, kun jokin ei voi hyvin.", "Palvelimen ylläpitäjä näkee jokaisen perheen laitteet tyyppeinä (ei nimiä) versioineen ja voi pyytää perhettä tarkistamaan laitteen ilmoituskeskuksen kautta.", "Yhdyskäytävä 1.3.0 kertoo, toimiiko se Home Assistant -sovelluksena vai omana konttinaan."],
    },
  },
  {
    version: "3.0.4",
    date: "2026-11-02",
    items: {
      sv: ["Ny skärmsläckare på köksskärmen: Räven och vädret. En räv på en kulle vid sjön visar vädret ute – den jagar fjärilar i solen, flyger drake när molnen drar förbi, läser en bok när det är grått, håller lyktan i dimman, står under paraplyet i regnet, bygger snögubbe när det snöar och sover hopkrullad på natten. Himlen följer tiden på dygnet och träden årstiden. Välj den under Familjeinställningar → Köksskärm.", "Allt om köksskärmen på ett ställe, under Familjeinställningar → Köksskärm: byt skärmsläckare med en bild av varje, välj vad som visas, när skärmen dämpas på natten och vad den får göra, byt namn och ge skärmen en ny länk. En knapp ger alla skärmar samma inställningar, och skärmen hämtar ändringen inom en minut.", "En förälder väljer barnets språk i appen under Familjeinställningar → Familjemedlemmar. En ny medlem får administratörens språk från början.", "Varje köksskärm kan ha ett eget språk – annars talar den familjeadministratörens.", "Flikarna överst på sidor med många flikar radbryts i stället för att klippas.", "Varje familjemedlem har en egen sida under Familjeinställningar → Familjemedlemmar: namn, färg och bild, lösenord och tvåstegsinloggning, språk och appar – och för ett barn födelsedag, lilla läget, veckopeng, medicin och nödkort. En förälder kan nu sätta barnets profilbild.", "Köksskärmen: veckans mat och receptboken som kort, med matlagningsläget direkt på skärmen. Kvällens middag har en Laga-knapp när det finns ett recept.", "Köksskärmen: välj vilka smarta enheter skärmen får styra – lås visas aldrig – och vilka färger den har.", "Räven visar dagens uppgifter över sjön (tre stycken, och hur många fler), och uppgifterna på köksskärmen har fått stora rader för fingrar.", "Familjeinställningarna har nu fem flikar: Familjemedlemmar (med varje persons egen sida och andra personer utan konto, som mormor, för födelsedagarna), Vardagen (med poängregler, hushållets nödkort och husdjurens medicin), Köksskärm, Delning och kopplingar samt Säkerhet och data. Vuxna som får hantera familjen öppnar barnens sidor där."],
      en: ["A new screensaver for the kitchen display: The fox and the weather. A fox on a hill by the lake plays out the weather outside – it chases butterflies in the sun, flies a kite when clouds pass, reads a book on grey days, holds a lantern in the fog, stands under its umbrella in the rain, builds a snowman when it snows and sleeps curled up at night. The sky follows the time of day and the trees the season. Choose it under Family settings → Kitchen display.", "Everything about the kitchen display in one place, under Family settings → Kitchen display: change the screensaver with a picture of each, choose what it shows, when it dims at night and what it may do, rename it and give it a new link. One button sets all screens the same, and the screen picks up a change within a minute.", "A parent chooses a child's language in the app under Family settings → Family members. A new member starts in the admin's language.", "Each kitchen display can have a language of its own – otherwise it speaks the family admin's.", "The tabs at the top of pages with many of them wrap onto a second row instead of being cut off.", "Each family member has a page of their own under Family settings → Family members: name, colour and picture, password and two-step sign-in, language and apps – and for a child the birthday, the little ones' mode, allowance, medicines and emergency card. A parent can now set a child's picture.", "Kitchen display: the week's meals and the recipe book as cards, with the cooking mode right on the screen. Tonight's dinner has a Cook button when there's a recipe.", "Kitchen display: choose which smart home devices the screen may switch – locks are never shown – and its colours.", "The fox shows the day's tasks over the lake (three, and how many more), and the tasks on the kitchen display have big rows for fingers.", "Family settings now have five tabs: Family members (each person's own page, and other people without an account, like grandma, for the birthdays), Everyday (with the points' rules, the household's emergency card and the pets' medicines), Kitchen display, Sharing and connections, and Security and data. Adults who may manage the family open the children's pages there."],
      nb: ["Ny skjermsparer på kjøkkenskjermen: Reven og været. En rev på en haug ved vannet viser været ute – den jager sommerfugler i solen, flyr drage når skyene drar forbi, leser en bok når det er grått, holder lykten i tåken, står under paraplyen i regnet, bygger snømann når det snør og sover sammenkrøllet om natten. Himmelen følger tiden på døgnet og trærne årstiden. Velg den under Familieinnstillinger → Kjøkkenskjerm.", "Alt om kjøkkenskjermen på ett sted, under Familieinnstillinger → Kjøkkenskjerm: bytt skjermsparer med et bilde av hver, velg hva som vises, når skjermen dempes om natten og hva den kan gjøre, gi den nytt navn og en ny lenke. Én knapp gir alle skjermer de samme innstillingene, og skjermen henter endringen innen ett minutt.", "En forelder velger barnets språk i appen under Familieinnstillinger → Familiemedlemmer. Et nytt medlem får administratorens språk fra start.", "Hver kjøkkenskjerm kan ha sitt eget språk – ellers snakker den familieadministratorens.", "Fanene øverst på sider med mange faner brytes over på en ny linje i stedet for å bli kuttet.", "Hvert familiemedlem har sin egen side under Familieinnstillinger → Familiemedlemmer: navn, farge og bilde, passord og totrinnspålogging, språk og apper – og for et barn fødselsdag, Lille modus, ukepenger, medisin og nødkort. En forelder kan nå sette barnets profilbilde.", "Kjøkkenskjermen: ukens mat og oppskriftsboken som kort, med matlagingsmodus rett på skjermen. Kveldens middag har en Lag-knapp når det finnes en oppskrift.", "Kjøkkenskjermen: velg hvilke smartenheter skjermen kan styre – låser vises aldri – og hvilke farger den har.", "Reven viser dagens oppgaver over vannet (tre, og hvor mange flere), og oppgavene på kjøkkenskjermen har fått store rader for fingre.", "Familieinnstillingene har nå fem faner: Familiemedlemmer (med hver persons egen side og andre personer uten konto, som mormor, for fødselsdagene), Hverdagen (med poengregler, husstandens nødkort og kjæledyrenes medisin), Kjøkkenskjerm, Deling og tilkoblinger og Sikkerhet og data. Voksne som kan håndtere familien, åpner barnas sider der."],
      da: ["Ny pauseskærm på køkkenskærmen: Ræven og vejret. En ræv på en bakke ved søen viser vejret udenfor – den jager sommerfugle i solen, flyver med drage, når skyerne driver forbi, læser en bog, når det er gråt, holder lygten i tågen, står under paraplyen i regnen, bygger snemand, når det sner, og sover sammenrullet om natten. Himlen følger tiden på døgnet og træerne årstiden. Vælg den under Familieindstillinger → Køkkenskærm.", "Alt om køkkenskærmen samlet ét sted under Familieindstillinger → Køkkenskærm: skift pauseskærm med et billede af hver, vælg hvad der vises, hvornår skærmen dæmpes om natten, og hvad den må, omdøb den, og giv den et nyt link. Én knap giver alle skærme de samme indstillinger, og skærmen henter ændringen inden for et minut.", "En forælder vælger barnets sprog i appen under Familieindstillinger → Familiemedlemmer. Et nyt medlem får administratorens sprog fra start.", "Hver køkkenskærm kan have sit eget sprog – ellers taler den familieadministratorens.", "Fanerne øverst på sider med mange faner brydes over på en ny linje i stedet for at blive skåret af.", "Hvert familiemedlem har sin egen side under Familieindstillinger → Familiemedlemmer: navn, farve og billede, adgangskode og totrinslogin, sprog og apps – og for et barn fødselsdag, Lille-tilstand, lommepenge, medicin og nødkort. En forælder kan nu sætte barnets profilbillede.", "Køkkenskærmen: ugens mad og opskriftsbogen som kort, med madlavningstilstanden direkte på skærmen. Aftenens aftensmad har en Lav-knap, når der er en opskrift.", "Køkkenskærmen: vælg hvilke smarte enheder skærmen må styre – låse vises aldrig – og hvilke farver den har.", "Ræven viser dagens opgaver over søen (tre, og hvor mange flere), og opgaverne på køkkenskærmen har fået store rækker til fingre.", "Familieindstillingerne har nu fem faner: Familiemedlemmer (med hver persons egen side og andre personer uden konto, som mormor, til fødselsdagene), Hverdagen (med pointregler, husstandens nødkort og kæledyrenes medicin), Køkkenskærm, Deling og forbindelser samt Sikkerhed og data. Voksne, der må håndtere familien, åbner børnenes sider der."],
      fi: ["Uusi näytönsäästäjä keittiön näytölle: Kettu ja sää. Kettu kukkulalla järven rannalla näyttää ulkona olevan sään – se jahtaa perhosia auringossa, lennättää leijaa pilvien ohittaessa, lukee kirjaa harmaina päivinä, pitää lyhtyä sumussa, seisoo sateenvarjon alla sateessa, rakentaa lumiukon lumisateessa ja nukkuu kerällä yöllä. Taivas seuraa vuorokaudenaikaa ja puut vuodenaikaa. Valitse se kohdasta Perheen asetukset → Keittiön näyttö.", "Kaikki keittiön näytön asetukset yhdessä paikassa, kohdassa Perheen asetukset → Keittiön näyttö: vaihda näytönsäästäjä kuvan perusteella, valitse mitä näytetään, milloin näyttö himmenee yöllä ja mitä se saa tehdä, nimeä se uudelleen ja anna sille uusi linkki. Yksi painike antaa kaikille näytöille samat asetukset, ja näyttö hakee muutoksen minuutin kuluessa.", "Vanhempi valitsee lapsen sovelluksen kielen kohdassa Perheen asetukset → Perheenjäsenet. Uusi jäsen saa aluksi ylläpitäjän kielen.", "Jokaisella keittiön näytöllä voi olla oma kielensä – muuten se puhuu perheen ylläpitäjän kieltä.", "Sivujen yläreunan välilehdet rivittyvät toiselle riville sen sijaan, että ne katkeaisivat.", "Jokaisella perheenjäsenellä on oma sivu kohdassa Perheen asetukset → Perheenjäsenet: nimi, väri ja kuva, salasana ja kaksivaiheinen kirjautuminen, kieli ja sovellukset – ja lapselta syntymäpäivä, Pikkutila, viikkoraha, lääkkeet ja hätäkortti. Vanhempi voi nyt asettaa lapsen profiilikuvan.", "Keittiön näyttö: viikon ruoat ja reseptikirja kortteina, ruoanlaittotila suoraan näytöllä. Illan päivällisellä on Kokkaa-painike, kun resepti on olemassa.", "Keittiön näyttö: valitse, mitä älylaitteita näyttö saa ohjata – lukkoja ei koskaan näytetä – ja mitkä värit sillä on.", "Kettu näyttää päivän tehtävät järven yllä (kolme, ja montako lisää), ja keittiön näytön tehtävillä on isot sormelle sopivat rivit.", "Perheen asetuksissa on nyt viisi välilehteä: Perheenjäsenet (jokaisen oma sivu ja muut ihmiset ilman tiliä, kuten mummo, syntymäpäiviä varten), Arki (pistesäännöt, kotitalouden hätäkortti ja lemmikkien lääkkeet), Keittiön näyttö, Jakaminen ja yhteydet sekä Turvallisuus ja tiedot. Perhettä hoitamaan oikeutetut aikuiset avaavat lasten sivut sieltä."],
    },
  },
  {
    version: "3.0.3",
    date: "2026-11-01",
    items: {
      sv: ["Köksskärmen i ny form: uppgifterna bockas av direkt på skärmen – tryck på uppgiften och sedan på ditt ansikte.", "Uppgifter som flera gör tillsammans: kryssa i Flera kan göra den tillsammans, så delas poängen mellan dem som gjorde den – på köksskärmen och i appen.", "Kvällens och morgondagens middag på köksskärmen, tillsammans med skolmaten.", "Helskärm med en knapp, och en skärmsläckare per skärm efter den tid du väljer: familjens foton, en flip-klocka, en lugn klocka med vädret eller en mörk skärm.", "Ett barns avbockning som en vuxen avvisat kan nu göras om samma dag."],
      en: ["The kitchen display in a new shape: tasks are ticked off right on the screen – tap the task, then your face.", "Tasks several do together: tick Several can do it together, and the points are shared between those who did it – on the kitchen display and in the app.", "Tonight's and tomorrow's dinner on the kitchen display, with the school lunch.", "Full screen with a button, and a screensaver per screen after the time you choose: the family's photos, a flip clock, a calm clock with the weather, or a dark screen.", "A child's tick that an adult rejected can now be done again the same day."],
      nb: ["Kjøkkenskjermen i ny form: oppgavene krysses av rett på skjermen – trykk på oppgaven og så på ansiktet ditt.", "Oppgaver flere gjør sammen: kryss av Flere kan gjøre den sammen, så deles poengene mellom dem som gjorde den – på kjøkkenskjermen og i appen.", "Kveldens og morgendagens middag på kjøkkenskjermen, sammen med skolematen.", "Fullskjerm med en knapp, og en skjermsparer per skjerm etter tiden du velger: familiens bilder, en klaffeklokke, en rolig klokke med været eller en mørk skjerm.", "Et barns avkryssing som en voksen avviste, kan nå gjøres på nytt samme dag."],
      da: ["Køkkenskærmen i ny form: opgaverne krydses af direkte på skærmen – tryk på opgaven og derefter på dit ansigt.", "Opgaver, flere laver sammen: sæt kryds ved Flere kan gøre den sammen, så deles pointene mellem dem, der gjorde den – på køkkenskærmen og i appen.", "Aftenens og morgendagens aftensmad på køkkenskærmen sammen med skolemaden.", "Fuld skærm med en knap og en pauseskærm pr. skærm efter den tid, du vælger: familiens billeder, et flip-ur, et roligt ur med vejret eller en mørk skærm.", "Et barns afkrydsning, som en voksen afviste, kan nu gøres igen samme dag."],
      fi: ["Keittiön näyttö uudessa muodossa: tehtävät kuitataan suoraan näytöllä – napauta tehtävää ja sitten omia kasvojasi.", "Tehtävät, joita useampi tekee yhdessä: valitse Useampi voi tehdä sen yhdessä, niin pisteet jaetaan tekijöiden kesken – keittiön näytöllä ja sovelluksessa.", "Illan ja huomisen päivällinen keittiön näytöllä koulun ruokalistan kanssa.", "Koko näyttö painikkeella ja näytönsäästäjä näyttökohtaisesti valitsemasi ajan jälkeen: perheen kuvat, läppäkello, rauhallinen kello ja sää tai pimeä näyttö.", "Lapsen kuittauksen, jonka aikuinen hylkäsi, voi nyt tehdä uudelleen samana päivänä."],
    },
  },
  {
    version: "3.0.2",
    date: "2026-10-31",
    items: {
      sv: ["Hjälpen är omgjord: varje funktion har en egen sida med förklaring, steg och skärmklipp från en exempelfamilj – på ditt språk. Sök, eller bläddra per område; du ser hjälpen för de appar du har.", "Frågetecknet bredvid en sidas rubrik öppnar hjälpen för just den sidan.", "Home Assistant beskrivs från början till slut: direktkopplingen, gatewayen för stugan som tillägg eller container, uppdateringarna och inköpslistorna till butikernas appar.", "Kalendern har knappen Ny händelse ensam i sidhuvudet – Två hem är en egen flik."],
      en: ["The help is new: each feature has a page of its own with an explanation, steps and screenshots from a sample family – in your language. Search, or browse by area; you see the help for the apps you have.", "The ? next to a page's title opens the help for that page.", "Home Assistant is described from start to finish: connecting directly, the gateway for the cabin as an add-on or a container, its updates and the shopping lists to the shops' apps.", "The calendar has only New event in its header – Two homes is a tab of its own."],
      nb: ["Hjelpen er ny: hver funksjon har sin egen side med forklaring, trinn og skjermbilder fra en eksempelfamilie – på ditt språk. Søk, eller bla per område; du ser hjelpen for appene du har.", "Spørsmålstegnet ved siden av en sides overskrift åpner hjelpen for akkurat den siden.", "Home Assistant beskrives fra start til slutt: den direkte koblingen, gatewayen for hytta som tillegg eller container, oppdateringene og handlelistene til butikkenes apper.", "Kalenderen har bare Ny hendelse i toppen – To hjem er en egen fane."],
      da: ["Hjælpen er ny: hver funktion har sin egen side med forklaring, trin og skærmbilleder fra en eksempelfamilie – på dit sprog. Søg, eller bladr efter område; du ser hjælpen til de apps, du har.", "Spørgsmålstegnet ved siden af en sides overskrift åbner hjælpen til netop den side.", "Home Assistant beskrives fra start til slut: den direkte forbindelse, gatewayen til sommerhuset som tilføjelse eller container, opdateringerne og indkøbslisterne til butikkernes apps.", "Kalenderen har kun Ny begivenhed i toppen – To hjem er en fane for sig."],
      fi: ["Ohjeet on uudistettu: jokaisella toiminnolla on oma sivunsa selityksineen, vaiheineen ja esimerkkiperheen kuvakaappauksineen – omalla kielelläsi. Hae tai selaa alueittain; näet ohjeet sovelluksille, jotka sinulla on.", "Sivun otsikon vieressä oleva kysymysmerkki avaa juuri sen sivun ohjeen.", "Home Assistant kuvataan alusta loppuun: suora yhteys, mökin yhdyskäytävä lisäosana tai konttina, sen päivitykset ja ostoslistat kauppojen sovelluksiin.", "Kalenterin yläreunassa on vain Uusi tapahtuma – Kaksi kotia on oma välilehtensä."],
    },
  },
  {
    version: "3.0.1",
    date: "2026-10-31",
    items: {
      sv: ["Klar-knappen på uppgifter visas som klar direkt när du trycker.", "Fliken Två hem i kalendern visas först när ett schema är inställt (Familjeinställningar → Barn).", "Ange barnets födelsedag när du lägger till det: den hamnar i Födelsedagar, och ett barn på 6 år eller yngre börjar i Lilla läget – som du ändrar under Uppgifter, eller i familjens kom igång-guide.", "Gatewayen för stugans Home Assistant uppdaterar sig själv från servern – bara med versioner som är signerade på familjens egen dator, och den gamla kommer tillbaka av sig själv om den nya inte fungerar."],
      en: ["The Done button on tasks shows as done the moment you tap it.", "The Two homes tab in the calendar shows once a schedule is set up (Family settings → Children).", "Give a child's birthday when you add them: it goes into Birthdays, and a child of 6 or younger starts in the little ones' mode – changed under Tasks, or in the family's setup guide.", "The gateway for the cabin's Home Assistant updates itself from the server – only with versions signed on the family's own computer, and the old one comes back by itself if the new one doesn't work."],
      nb: ["Ferdig-knappen på oppgaver vises som ferdig med en gang du trykker.", "Fanen To hjem i kalenderen vises først når en timeplan er satt opp (Familieinnstillinger → Barn).", "Oppgi barnets fødselsdag når du legger det til: den havner i Fødselsdager, og et barn på 6 år eller yngre starter i Lille modus – som du endrer under Oppgaver eller i familiens kom i gang-veiledning.", "Gatewayen for hyttas Home Assistant oppdaterer seg selv fra serveren – bare med versjoner signert på familiens egen datamaskin, og den gamle kommer tilbake av seg selv hvis den nye ikke virker."],
      da: ["Færdig-knappen på opgaver vises som færdig, så snart du trykker.", "Fanen To hjem i kalenderen vises først, når en plan er sat op (Familieindstillinger → Børn).", "Angiv barnets fødselsdag, når du tilføjer det: den havner i Fødselsdage, og et barn på 6 år eller yngre starter i Lille-tilstand – som du ændrer under Opgaver eller i familiens kom i gang-guide.", "Gatewayen til sommerhusets Home Assistant opdaterer sig selv fra serveren – kun med versioner, der er signeret på familiens egen computer, og den gamle kommer selv tilbage, hvis den nye ikke virker."],
      fi: ["Tehtävien Valmis-painike näkyy valmiina heti kun painat.", "Kalenterin Kaksi kotia -välilehti näkyy vasta kun aikataulu on asetettu (Perheen asetukset → Lapset).", "Anna lapsen syntymäpäivä, kun lisäät hänet: se menee Syntymäpäiviin, ja 6-vuotias tai nuorempi lapsi aloittaa Pikkutilassa – jota muutat kohdassa Tehtävät tai perheen aloitusoppaassa.", "Mökin Home Assistantin yhdyskäytävä päivittyy itse palvelimelta – vain perheen omalla tietokoneella allekirjoitetuilla versioilla, ja vanha palaa itsestään, jos uusi ei toimi."],
    },
  },
  {
    version: "3.0.0",
    date: "2026-10-30",
    items: {
      sv: ["En ny meny i grupper med flikar, och tre nivåer av inställningar: Min profil, Familjeinställningar och Serverinställningar. En ny server och en ny familj börjar med en guide som förklarar varje val och föreslår det bästa.", "Kalendern i ny form – månaden med staplar för längre händelser, veckan timme för timme. Vem kör, packlistor på händelser, Söndagskollen, väder från SMHI och en morgonsammanfattning när du vill.", "Uppgifter: turas om, och efterrapportera det du gjort men glömt bocka av – upp till tre dagar bakåt. Medicindoser och packning inför en resa eller en händelse blir uppgifter med poäng; en vuxen kan ge ett barns dos och barnet får ändå poängen.", "Två hem för barn som bor hos båda föräldrarna: schemat, överlämningar med en lista, ett konto eller en länk för den andra föräldern, och barnens kostnader delade mellan hemmen.", "Lilla läget: barn som inte kan läsa än får stora bildkort för morgon- och kvällsrutinerna, med klistermärken när de är klara.", "Mat: skafferiet med skanning och bäst före-datum, receptboken med betyg från alla och ”Kan lagas nu”, matlagningsläget, och skafferiet räknas ner av sig självt efter middagen.", "Valvet: foton, filer, dokument, kvitton och en lösenordshanterare på ett ställe – delade med en gästlänk som slutar gälla av sig själv, och Word, Excel och PowerPoint visas i webbläsaren.", "Kvitton som den lokala AI:n läser, med påminnelser före sista returdag och när garantin går ut, ”Året i siffror” och en lista för hemförsäkringen.", "Hem: bostaden med underhåll, saker per rum och energi; fordon med påminnelser, kostnader, däck, laddning och en rapport för en köpare; och Ekonomi med inkomster, budget per kategori och import från banken.", "Trygghet: nödkort som en barnvakt eller mor- och farföräldrar läser via en gästlänk, mediciner med påminnelser, och husdjur med veterinärbesök och sysslor.", "Önskelistor och hemlig presentplanering – och en önskelista som delas med släktingar som inte har något konto.", "Smarta hemmet per bostad: flöden (När → Om → Gör), vem som är hemma, högtalare, elpriset och en köksskärm. Stugans Home Assistant kopplas in via Smooth Family-tillägget (Home Assistant OS) eller gatewayen som container, utan att någon port öppnas. Inköpslistor kan skickas till en att göra-lista i Home Assistant – nytt och inte fullt testat med butikerna ännu.", "Sök på nätet via serverns egen sökmotor, och en valfri lokal AI (Ollama) för kvitton, recept, matsedlar och sysslor – bara sökorden lämnar servern.", "Fungerar utan täckning: bocka av inköpslistan och uppgifter i en butik utan mottagning; det skickas när du är uppkopplad igen.", "Säkrare: backuper förseglade med en nyckel som bara du har (och en egen familjenyckel), 12 tecken som standard för lösenord, hårdare skydd i webbläsaren, serverns delar körs med minsta möjliga rättigheter, och deras säkerhetsfixar läggs in av sig själva – med en backup först och den gamla versionen tillbaka om något går fel.", "Samma utseende överallt: varje sida har samma rubrik och flikarna på samma plats, och inget hoppar när du byter mellan dem."],
      en: ["A new menu in groups with tabs, and three levels of settings: My profile, Family settings and Server settings. A new server and a new family start with a setup guide that explains each choice and suggests what's best.", "The calendar in a new shape – the month with bars for longer events, the week by the hour. Who drives, packing lists on events, Söndagskollen, weather from SMHI and a morning summary at the time you choose.", "Tasks: take turns, and report what you did but forgot to tick off – up to three days back. Medicine doses and packing for a trip or an event become tasks with points; an adult can give a child's dose and the child still gets the points.", "Two homes for children who live with both parents: the schedule, handovers with a list, an account or a link for the other parent, and the children's costs shared between the homes.", "The little ones' mode: children who can't read yet get big picture cards for their morning and evening routines, with stickers when they're done.", "Food: the pantry with scanning and best-before dates, the recipe book with stars from everyone and “Can be made now”, cooking mode, and the pantry counts itself down after dinner.", "The vault: photos, files, documents, receipts and a password manager in one place – shared with a guest link that runs out by itself, and Word, Excel and PowerPoint viewed in the browser.", "Receipts read by the local AI, with reminders before the last day to return and the end of the warranty, “The year in numbers” and a list for the home insurance.", "Home: the property with maintenance, things per room and energy; vehicles with reminders, costs, tyres, charging and a report for a buyer; and Economy with incomes, a budget per category and import from the bank.", "Safety: emergency cards a babysitter or the grandparents read through a guest link, medicines with reminders, and pets with vet visits and chores.", "Wish lists and secret gift planning – and a wish list shared with relatives who have no account.", "Smart home per home: flows (When → If → Do), who's home, speakers, the electricity price and a kitchen display. The cabin's Home Assistant joins through the Smooth Family add-on (Home Assistant OS) or the gateway as a container, without opening a port. Shopping lists can go to a to-do list in Home Assistant – new and not fully tested with the shops yet.", "Search the web through the server's own search engine, and an optional local AI (Ollama) for receipts, recipes, meal plans and chores – only the search words leave the server.", "Works without coverage: tick off the shopping list and tasks in a shop without reception; it's sent when you're back online.", "Safer: backups sealed with a key only you keep (and a family key of its own), 12-character passwords by default, stricter protection in the browser, the server's parts running with the least rights, and their security fixes put in by themselves – with a backup first and the old version back if something fails.", "One look everywhere: every page has the same heading and tabs in the same place, and nothing jumps when you move between them."],
      nb: ["En ny meny i grupper med faner, og tre nivåer av innstillinger: Min profil, Familieinnstillinger og Serverinnstillinger. En ny server og en ny familie starter med en veiledning som forklarer hvert valg og foreslår det beste.", "Kalenderen i ny form – måneden med striper for lengre hendelser, uken time for time. Hvem kjører, pakkelister på hendelser, Söndagskollen, vær fra SMHI og et morgensammendrag når du vil.", "Oppgaver: gå på omgang, og etterrapporter det du gjorde men glemte å krysse av – opptil tre dager tilbake. Medisindoser og pakking før en reise eller en hendelse blir oppgaver med poeng; en voksen kan gi et barns dose, og barnet får likevel poengene.", "To hjem for barn som bor hos begge foreldrene: timeplanen, overleveringer med en liste, en konto eller en lenke for den andre forelderen, og barnas kostnader delt mellom hjemmene.", "Lille modus: barn som ikke kan lese ennå, får store bildekort for morgen- og kveldsrutinene, med klistremerker når de er ferdige.", "Mat: spiskammeret med skanning og best før-datoer, oppskriftsboken med stjerner fra alle og «Kan lages nå», matlagingsmodus, og spiskammeret teller ned av seg selv etter middagen.", "Hvelvet: bilder, filer, dokumenter, kvitteringer og en passordbehandler på ett sted – delt med en gjestelenke som slutter å gjelde av seg selv, og Word, Excel og PowerPoint vist i nettleseren.", "Kvitteringer som den lokale AI-en leser, med påminnelser før siste returdag og når garantien går ut, «Året i tall» og en liste for innboforsikringen.", "Hjem: boligen med vedlikehold, ting per rom og energi; kjøretøy med påminnelser, kostnader, dekk, lading og en rapport for en kjøper; og Økonomi med inntekter, budsjett per kategori og import fra banken.", "Trygghet: nødkort som en barnevakt eller besteforeldrene leser via en gjestelenke, medisiner med påminnelser, og kjæledyr med veterinærbesøk og gjøremål.", "Ønskelister og hemmelig gaveplanlegging – og en ønskeliste som deles med slektninger som ikke har noen konto.", "Smarthjem per bolig: flyter (Når → Hvis → Gjør), hvem som er hjemme, høyttalere, strømprisen og en kjøkkenskjerm. Hyttas Home Assistant kobles til via Smooth Family-tillegget (Home Assistant OS) eller gatewayen som container, uten at noen port åpnes. Handlelister kan sendes til en gjøremålsliste i Home Assistant – nytt og ikke fullt testet med butikkene ennå.", "Søk på nettet via serverens egen søkemotor, og en valgfri lokal AI (Ollama) for kvitteringer, oppskrifter, middagsplaner og gjøremål – bare søkeordene forlater serveren.", "Virker uten dekning: kryss av handlelisten og oppgaver i en butikk uten mottak; det sendes når du er på nett igjen.", "Sikrere: sikkerhetskopier forseglet med en nøkkel bare du har (og en egen familienøkkel), 12 tegn som standard for passord, strengere beskyttelse i nettleseren, serverens deler kjører med minst mulig rettigheter, og sikkerhetsrettingene deres legges inn av seg selv – med en sikkerhetskopi først og den gamle versjonen tilbake hvis noe feiler.", "Samme utseende overalt: hver side har samme overskrift og fanene på samme sted, og ingenting hopper når du bytter mellom dem."],
      da: ["En ny menu i grupper med faner og tre niveauer af indstillinger: Min profil, Familieindstillinger og Serverindstillinger. En ny server og en ny familie starter med en guide, der forklarer hvert valg og foreslår det bedste.", "Kalenderen i ny form – måneden med bjælker for længere begivenheder, ugen time for time. Hvem kører, pakkelister på begivenheder, Söndagskollen, vejr fra SMHI og en morgenoversigt, når du vil.", "Opgaver: skiftes, og efterrapportér det, du lavede, men glemte at krydse af – op til tre dage tilbage. Medicindoser og pakning før en rejse eller en begivenhed bliver opgaver med point; en voksen kan give et barns dosis, og barnet får alligevel pointene.", "To hjem for børn, der bor hos begge forældre: planen, overleveringer med en liste, en konto eller et link til den anden forælder og børnenes udgifter delt mellem hjemmene.", "Lille-tilstand: børn, der ikke kan læse endnu, får store billedkort til morgen- og aftenrutinerne med klistermærker, når de er færdige.", "Mad: spisekammeret med scanning og bedst før-datoer, opskriftsbogen med stjerner fra alle og ”Kan laves nu”, madlavningstilstand, og spisekammeret tæller selv ned efter aftensmaden.", "Boksen: billeder, filer, dokumenter, kvitteringer og en adgangskodeadministrator ét sted – delt med et gæstelink, der selv udløber, og Word, Excel og PowerPoint vist i browseren.", "Kvitteringer, som den lokale AI læser, med påmindelser før sidste returdag og når garantien udløber, ”Året i tal” og en liste til indboforsikringen.", "Hjem: boligen med vedligeholdelse, ting pr. rum og energi; køretøjer med påmindelser, udgifter, dæk, opladning og en rapport til en køber; og Økonomi med indtægter, budget pr. kategori og import fra banken.", "Tryghed: nødkort, som en babysitter eller bedsteforældrene læser via et gæstelink, medicin med påmindelser og kæledyr med dyrlægebesøg og opgaver.", "Ønskelister og hemmelig gaveplanlægning – og en ønskeliste delt med slægtninge uden konto.", "Smart hjem pr. bolig: flows (Når → Hvis → Gør), hvem der er hjemme, højttalere, elprisen og en køkkenskærm. Sommerhusets Home Assistant forbindes via Smooth Family-tilføjelsen (Home Assistant OS) eller gatewayen som container uden at åbne en port. Indkøbslister kan sendes til en opgaveliste i Home Assistant – nyt og ikke fuldt testet med butikkerne endnu.", "Søg på nettet via serverens egen søgemaskine og en valgfri lokal AI (Ollama) til kvitteringer, opskrifter, madplaner og opgaver – kun søgeordene forlader serveren.", "Virker uden dækning: kryds indkøbslisten og opgaver af i en butik uden signal; det sendes, når du er online igen.", "Sikrere: backupper forseglet med en nøgle, som kun du har (og en egen familienøgle), 12 tegn som standard for adgangskoder, strammere beskyttelse i browseren, serverens dele kører med færrest mulige rettigheder, og deres sikkerhedsrettelser lægges selv ind – med en backup først og den gamle version tilbage, hvis noget fejler.", "Samme udseende overalt: hver side har samme overskrift og fanerne samme sted, og intet hopper, når du skifter mellem dem."],
      fi: ["Uusi valikko ryhmissä välilehtineen ja kolme asetustasoa: Oma profiili, Perheen asetukset ja Palvelimen asetukset. Uusi palvelin ja uusi perhe aloittavat oppaalla, joka selittää jokaisen valinnan ja ehdottaa parasta.", "Kalenteri uudessa muodossa – kuukausi palkkeineen pidemmille tapahtumille, viikko tunneittain. Kuka ajaa, pakkauslistat tapahtumiin, Söndagskollen, sää SMHI:ltä ja aamuyhteenveto haluamaasi aikaan.", "Tehtävät: vuorottelu, ja ilmoita jälkikäteen se, minkä teit mutta unohdit kuitata – enintään kolme päivää taaksepäin. Lääkeannokset ja pakkaaminen ennen matkaa tai tapahtumaa ovat tehtäviä pisteineen; aikuinen voi antaa lapsen annoksen, ja lapsi saa silti pisteet.", "Kaksi kotia lapsille, jotka asuvat molempien vanhempien luona: aikataulu, vaihdot listoineen, tili tai linkki toiselle vanhemmalle ja lasten kulut jaettuina kotien kesken.", "Pikkutila: lapset, jotka eivät vielä osaa lukea, saavat isot kuvakortit aamu- ja iltarutiineihin ja tarroja, kun ne on tehty.", "Ruoka: ruokakomero skannauksella ja parasta ennen -päivillä, reseptikirja kaikkien tähtineen ja ”Voi tehdä nyt”, ruoanlaittotila, ja ruokakomero laskee itse alas päivällisen jälkeen.", "Holvi: kuvat, tiedostot, asiakirjat, kuitit ja salasanojen hallinta yhdessä paikassa – jaettuna vieraslinkillä, joka vanhenee itsestään, ja Word, Excel ja PowerPoint selaimessa.", "Kuitit, jotka paikallinen tekoäly lukee, muistutuksineen ennen viimeistä palautuspäivää ja takuun päättymistä, ”Vuosi numeroina” ja lista kotivakuutusta varten.", "Koti: asunto huoltoineen, tavarat huoneittain ja energia; ajoneuvot muistutuksineen, kuluineen, renkaineen, latauksineen ja raportti ostajalle; sekä Talous tuloineen, budjetteineen luokittain ja pankkituonteineen.", "Turva: hätäkortit, jotka lapsenvahti tai isovanhemmat lukevat vieraslinkin kautta, lääkkeet muistutuksineen ja lemmikit eläinlääkärikäynteineen ja kotitöineen.", "Toivelistat ja salainen lahjasuunnittelu – ja toivelista jaettuna sukulaisille, joilla ei ole tiliä.", "Älykoti asunnoittain: kulut (Kun → Jos → Tee), kuka on kotona, kaiuttimet, sähkön hinta ja keittiön näyttö. Mökin Home Assistant liitetään Smooth Family -lisäosalla (Home Assistant OS) tai yhdyskäytävällä konttina avaamatta porttia. Ostoslistat voi lähettää Home Assistantin tehtävälistaan – uutta eikä vielä täysin testattu kauppojen kanssa.", "Hae verkosta palvelimen omalla hakukoneella, ja valinnainen paikallinen tekoäly (Ollama) kuitteihin, resepteihin, ruokalistoihin ja kotitöihin – vain hakusanat lähtevät palvelimelta.", "Toimii ilman kenttää: kuittaa ostoslista ja tehtävät kaupassa ilman yhteyttä; muutokset lähetetään, kun olet taas verkossa.", "Turvallisempi: varmuuskopiot sinetöity avaimella, joka on vain sinulla (ja perheen oma avain), salasanoissa oletuksena 12 merkkiä, tiukempi suojaus selaimessa, palvelimen osat toimivat vähimmillä oikeuksilla, ja niiden tietoturvakorjaukset asennetaan itsestään – ensin varmuuskopio ja vanha versio takaisin, jos jokin epäonnistuu.", "Sama ilme kaikkialla: jokaisella sivulla on sama otsikko ja välilehdet samassa paikassa, eikä mikään hypi, kun siirryt niiden välillä."],
    },
  },
  {
    version: "2.1.0",
    date: "2026-10-27",
    items: {
      sv: ["Fler familjer på samma server: serverns admin bjuder in en familj med en engångslänk (giltig 1–90 dagar). De kan prova en demofamilj först och sedan skapa sin egen. Familjerna ser aldrig varandras data, och admin ser bara namn, antal och storlekar.", "Serversidan: familjer, inbjudningar, pausa eller ta bort en familj, flytta en familj krypterat till en annan server, säkerhetskopior och en logg som familjen också kan läsa.", "Demoläge: prova appen med en exempelfamilj – byt mellan Anna, Erik, Maja och Leo med ett tryck och börja om när du vill."],
      en: ["Several families on one server: the server's admin invites a family with a one-time link (valid 1–90 days). They can try a demo family first and then create their own. Families never see each other's data, and the admin only sees names, counts and sizes.", "The server page: families, invitations, pause or remove a family, move a family encrypted to another server, backups and a log the family can read too.", "Demo mode: try the app with a sample family – switch between Anna, Erik, Maja and Leo with one tap and start over whenever you like."],
      nb: ["Flere familier på samme server: serverens admin inviterer en familie med en engangslenke (gyldig 1–90 dager). De kan prøve en demofamilie først og så opprette sin egen. Familiene ser aldri hverandres data, og admin ser bare navn, antall og størrelser.", "Serversiden: familier, invitasjoner, pause eller fjerne en familie, flytte en familie kryptert til en annen server, sikkerhetskopier og en logg familien også kan lese.", "Demomodus: prøv appen med en eksempelfamilie – bytt mellom Anna, Erik, Maja og Leo med ett trykk og start på nytt når du vil."],
      da: ["Flere familier på samme server: serverens admin inviterer en familie med et engangslink (gyldigt 1–90 dage). De kan prøve en demofamilie først og derefter oprette deres egen. Familierne ser aldrig hinandens data, og admin ser kun navne, antal og størrelser.", "Serversiden: familier, invitationer, sæt en familie på pause eller fjern den, flyt en familie krypteret til en anden server, sikkerhedskopier og en log, som familien også kan læse.", "Demotilstand: prøv appen med en eksempelfamilie – skift mellem Anna, Erik, Maja og Leo med ét tryk, og start forfra, når du vil."],
      fi: ["Useita perheitä samalla palvelimella: palvelimen ylläpitäjä kutsuu perheen kertakäyttöisellä linkillä (voimassa 1–90 päivää). He voivat kokeilla ensin demoperhettä ja luoda sitten oman. Perheet eivät koskaan näe toistensa tietoja, ja ylläpitäjä näkee vain nimet, määrät ja koot.", "Palvelinsivu: perheet, kutsut, perheen keskeyttäminen tai poistaminen, perheen salattu siirto toiselle palvelimelle, varmuuskopiot ja loki, jonka perhekin voi lukea.", "Demotila: kokeile sovellusta esimerkkiperheellä – vaihda Annan, Erikin, Majan ja Leon välillä yhdellä napautuksella ja aloita alusta milloin haluat."],
    },
  },
  {
    version: "2.0.0",
    date: "2026-10-27",
    items: {
      sv: ["Smooth Family 2.0! Sedan 1.6 har appen fått live-uppdateringar, notiscenter, appar per familjemedlem, grupperad meny, födelsedagar och önskelistor, belöningsbutik, sparburkar, recept från länk, sophämtning och skollunch – och nu säkerhetskopior och dataexport.", "Säkerhetskopior i appen: serverns admin kan ta backup direkt, se och ladda ner alla säkerhetskopior och välja en daglig tid. Idag varnar om senaste backupen är för gammal.", "Exportera familjens data: under Familjeadmin → Lagring och backup laddar du ner allt familjen har i appen, med foton och filer, som en zip – utan lösenord och andra hemligheter."],
      en: ["Smooth Family 2.0! Since 1.6 the app has gained live updates, a notification centre, apps per family member, a grouped menu, birthdays and wish lists, a reward shop, savings jars, recipes from a link, waste collection and school lunch – and now backups and data export.", "Backups in the app: the server's admin can back up right away, see and download every backup and choose a daily time. Today warns when the newest backup is too old.", "Export the family's data: under Family admin → Storage & backup you download everything your family has in the app, with photos and files, as a zip – without passwords and other secrets."],
      nb: ["Smooth Family 2.0! Siden 1.6 har appen fått sanntidsoppdateringer, varselsenter, apper per familiemedlem, gruppert meny, bursdager og ønskelister, belønningsbutikk, sparebøsser, oppskrifter fra lenke, søppeltømming og skolelunsj – og nå sikkerhetskopier og dataeksport.", "Sikkerhetskopier i appen: serverens admin kan ta backup med en gang, se og laste ned alle sikkerhetskopier og velge et daglig tidspunkt. I dag varsler når siste backup er for gammel.", "Eksporter familiens data: under Familieadmin → Lagring og sikkerhetskopi laster du ned alt familien har i appen, med bilder og filer, som en zip – uten passord og andre hemmeligheter."],
      da: ["Smooth Family 2.0! Siden 1.6 har appen fået liveopdateringer, notifikationscenter, apps pr. familiemedlem, grupperet menu, fødselsdage og ønskelister, belønningsbutik, sparegrise, opskrifter fra link, affaldsafhentning og skolefrokost – og nu sikkerhedskopier og dataeksport.", "Sikkerhedskopier i appen: serverens admin kan tage backup med det samme, se og downloade alle sikkerhedskopier og vælge et dagligt tidspunkt. I dag advarer, når den seneste backup er for gammel.", "Eksportér familiens data: under Familieadmin → Lagring og backup downloader du alt, familien har i appen, med fotos og filer, som en zip – uden adgangskoder og andre hemmeligheder."],
      fi: ["Smooth Family 2.0! Version 1.6 jälkeen sovellus on saanut reaaliaikaiset päivitykset, ilmoituskeskuksen, sovellukset perheenjäsenittäin, ryhmitellyn valikon, syntymäpäivät ja toivelistat, palkintokaupan, säästöpossut, reseptit linkistä, jätehuollon ja kouluruoan – ja nyt varmuuskopiot ja tietojen viennin.", "Varmuuskopiot sovelluksessa: palvelimen ylläpitäjä voi varmuuskopioida heti, nähdä ja ladata kaikki varmuuskopiot ja valita päivittäisen ajan. Tänään-sivu varoittaa, jos uusin varmuuskopio on liian vanha.", "Vie perheen tiedot: kohdasta Perheen ylläpito → Tallennus ja varmuuskopiot lataat kaiken, mitä perheellä on sovelluksessa, kuvineen ja tiedostoineen zip-tiedostona – ilman salasanoja ja muita salaisuuksia."],
    },
  },
  {
    version: "1.9.5",
    date: "2026-10-27",
    items: {
      sv: ["Sparburkar: lägg till egna burkar för det barnet sparar till – en skateboard, ett tv-spel, presenter. Varje burk får en andel av veckopengen och kan ha ett mål med förloppsmätare; resten hamnar i Slösa. Barnen kan lägga undan pengar och vuxna kan ge bonus eller ränta.", "Nya kort på Idag: sophämtning (med påminnelse kvällen innan) och skollunch från skolmaten.se per barn. Ställs in under Familjeadmin → Kort på Idag."],
      en: ["Savings jars: add jars for what a child saves towards – a skateboard, a video game, gifts. Each jar gets a share of the allowance and can have a target with a progress bar; the rest goes to Spend. Children can put money aside and adults can add a bonus or interest.", "New Today cards: waste collection (with a reminder the evening before) and school lunch from skolmaten.se per child. Set up under Family admin → Today cards."],
      nb: ["Sparebøsser: legg til egne bøsser for det barnet sparer til – et skateboard, et TV-spill, gaver. Hver bøsse får en andel av ukepengene og kan ha et mål med fremdriftsmåler; resten havner i Bruke. Barna kan legge til side penger, og voksne kan gi bonus eller rente.", "Nye kort på I dag: søppeltømming (med påminnelse kvelden før) og skolelunsj fra skolmaten.se per barn. Settes opp under Familieadmin → Kort på I dag."],
      da: ["Sparegrise: tilføj egne sparegrise til det, barnet sparer op til – et skateboard, et computerspil, gaver. Hver sparegris får en andel af lommepengene og kan have et mål med fremskridtsbjælke; resten havner i Bruge. Børnene kan lægge penge til side, og voksne kan give bonus eller rente.", "Nye kort på I dag: affaldsafhentning (med påmindelse aftenen før) og skolefrokost fra skolmaten.se pr. barn. Opsættes under Familieadmin → Kort på I dag."],
      fi: ["Säästöpossut: lisää omia possuja sille, mihin lapsi säästää – rullalauta, videopeli, lahjat. Jokainen possu saa osuuden viikkorahasta ja sillä voi olla tavoite edistymispalkilla; loput menevät Käytä-possuun. Lapset voivat laittaa rahaa sivuun ja aikuiset antaa bonusta tai korkoa.", "Uudet Tänään-kortit: jätehuolto (muistutus edellisenä iltana) ja kouluruoka skolmaten.se-palvelusta lapsittain. Määritetään kohdassa Perheen ylläpito → Tänään-kortit."],
    },
  },
  {
    version: "1.9.0",
    date: "2026-10-27",
    items: {
      sv: ["Födelsedagar: familjens och släktens födelsedagar syns i kalendern med påminnelse en vecka innan. Varje person har en önskelista där andra kan markera \"Jag köper den här\" – utan att personen ser det – och vuxna kan spara presentidéer.", "Belöningsbutik: vuxna lägger upp belöningar med poängpris, barnen köper med sina egna poäng och en vuxen godkänner.", "Recept från länk: klistra in länken till ett recept under Mat så fylls namn, ingredienser, steg och bild i automatiskt."],
      en: ["Birthdays: the family's and relatives' birthdays show in the calendar with a reminder a week before. Everyone has a wish list where others can mark \"I'm buying this\" – without the person seeing it – and adults can keep gift ideas.", "Reward shop: adults add rewards with a points price, children buy with their own points and an adult approves.", "Recipe from a link: paste the link to a recipe under Food and the name, ingredients, steps and photo are filled in."],
      nb: ["Bursdager: familiens og slektens bursdager vises i kalenderen med påminnelse en uke før. Alle har en ønskeliste der andre kan markere «Jeg kjøper denne» – uten at personen ser det – og voksne kan lagre gaveideer.", "Belønningsbutikk: voksne legger inn belønninger med poengpris, barna kjøper med egne poeng og en voksen godkjenner.", "Oppskrift fra lenke: lim inn lenken til en oppskrift under Mat, så fylles navn, ingredienser, trinn og bilde inn automatisk."],
      da: ["Fødselsdage: familiens og slægtens fødselsdage vises i kalenderen med påmindelse en uge før. Alle har en ønskeliste, hvor andre kan markere »Jeg køber denne« – uden at personen ser det – og voksne kan gemme gaveidéer.", "Belønningsbutik: voksne opretter belønninger med pointpris, børnene køber med deres egne point, og en voksen godkender.", "Opskrift fra link: indsæt linket til en opskrift under Mad, så udfyldes navn, ingredienser, trin og billede automatisk."],
      fi: ["Syntymäpäivät: perheen ja suvun syntymäpäivät näkyvät kalenterissa, ja muistutus tulee viikkoa ennen. Jokaisella on toivelista, jossa muut voivat merkitä ”Minä ostan tämän” – henkilön näkemättä – ja aikuiset voivat tallentaa lahjaideoita.", "Palkintokauppa: aikuiset lisäävät palkintoja pistehinnalla, lapset ostavat omilla pisteillään ja aikuinen hyväksyy.", "Resepti linkistä: liitä reseptin linkki kohtaan Ruoka, niin nimi, ainesosat, vaiheet ja kuva täyttyvät automaattisesti."],
    },
  },
  {
    version: "1.8.5",
    date: "2026-10-27",
    items: {
      sv: ["Notiscenter: klockan uppe till höger samlar godkännanden, förslag, påminnelser och upplåsta mål – även när push är avstängt. Tryck på en notis för att komma dit det hände.", "Appen uppdateras direkt: nya chattmeddelanden, uppgifter, listor och ändringar i smarta hemmet syns hos alla i familjen utan att man behöver ladda om.", "Du väljer själv under Profil → Meny om apparna ska grupperas. I mobilen är de som standard ogrupperade i din egen ordning, på datorn grupperade."],
      en: ["Notification centre: the bell at the top right collects approvals, suggestions, reminders and unlocked goals – also when push is off. Tap one to go where it happened.", "The app updates at once: new chat messages, tasks, lists and smart home changes show up for everyone in the family without reloading.", "Choose under Profile → Menu whether the apps are grouped. On phones they are ungrouped in your own order by default, on computers grouped."],
      nb: ["Varselsenter: klokken øverst til høyre samler godkjenninger, forslag, påminnelser og opplåste mål – også når push er slått av. Trykk på et varsel for å komme dit det skjedde.", "Appen oppdateres med en gang: nye chatmeldinger, oppgaver, lister og endringer i smarthjemmet vises for alle i familien uten å laste inn på nytt.", "Velg selv under Profil → Meny om appene skal grupperes. På mobilen er de som standard ugruppert i din egen rekkefølge, på datamaskinen gruppert."],
      da: ["Notifikationscenter: klokken øverst til højre samler godkendelser, forslag, påmindelser og låste mål op – også når push er slået fra. Tryk på en for at komme derhen, hvor det skete.", "Appen opdateres med det samme: nye chatbeskeder, opgaver, lister og ændringer i smarthjemmet vises for alle i familien uden genindlæsning.", "Vælg selv under Profil → Menu, om apps skal grupperes. På mobilen er de som standard ugrupperede i din egen rækkefølge, på computeren grupperede."],
      fi: ["Ilmoituskeskus: oikean yläkulman kello kokoaa hyväksynnät, ehdotukset, muistutukset ja avatut tavoitteet – myös kun push on pois päältä. Napauta ilmoitusta siirtyäksesi sinne, missä se tapahtui.", "Sovellus päivittyy heti: uudet chat-viestit, tehtävät, listat ja älykodin muutokset näkyvät koko perheelle ilman uudelleenlatausta.", "Valitse kohdassa Profiili → Valikko, ryhmitelläänkö sovellukset. Puhelimessa ne ovat oletuksena ryhmittelemättä omassa järjestyksessäsi, tietokoneella ryhmiteltyinä."],
    },
  },
  {
    version: "1.8.0",
    date: "2026-10-27",
    items: {
      sv: ["Menyn är grupperad i Familjen, Poäng och Hemmet. På mobilen öppnar varje grupp sina appar.", "Familjeadmin väljer vilka appar varje medlem får använda (Familjeadmin → Medlemmar → Appar). Barn får som standard inte Bostad och Fordon. I Fordon väljer admin också vem som ser varje fordon.", "Familjeadmin är uppdelad i egna sidor: Medlemmar, Hemmet, Kalendrar, Poäng, Smarta hemmet, Säkerhet, Integrationer och Lagring."],
      en: ["The menu is grouped into Family, Points and Home. On phones each group opens its apps.", "The family admin chooses which apps each member may use (Family admin → Members → Apps). Children don't get Property and Vehicles by default. In Vehicles the admin also chooses who sees each vehicle.", "Family admin is split into pages of its own: Members, Home, Calendars, Points, Smart home, Security, Integrations and Storage."],
      nb: ["Menyen er gruppert i Familien, Poeng og Hjemmet. På mobilen åpner hver gruppe sine apper.", "Familieadmin velger hvilke apper hvert medlem kan bruke (Familieadmin → Medlemmer → Apper). Barn får som standard ikke Bolig og Kjøretøy. I Kjøretøy velger admin også hvem som ser hvert kjøretøy.", "Familieadmin er delt opp i egne sider: Medlemmer, Hjemmet, Kalendere, Poeng, Smarthjem, Sikkerhet, Integrasjoner og Lagring."],
      da: ["Menuen er grupperet i Familien, Point og Hjemmet. På mobilen åbner hver gruppe sine apps.", "Familieadmin vælger, hvilke apps hvert medlem må bruge (Familieadmin → Medlemmer → Apps). Børn får som standard ikke Bolig og Køretøjer. I Køretøjer vælger admin også, hvem der ser hvert køretøj.", "Familieadmin er delt op i egne sider: Medlemmer, Hjemmet, Kalendere, Point, Smarthjem, Sikkerhed, Integrationer og Lagring."],
      fi: ["Valikko on ryhmitelty: Perhe, Pisteet ja Koti. Puhelimessa kukin ryhmä avaa omat sovelluksensa.", "Perheen ylläpitäjä valitsee, mitä sovelluksia kukin jäsen saa käyttää (Perheen ylläpito → Jäsenet → Sovellukset). Lapset eivät oletuksena saa Asuntoa ja Ajoneuvoja. Ajoneuvoissa ylläpitäjä valitsee myös, kuka näkee kunkin ajoneuvon.", "Perheen ylläpito on jaettu omiin sivuihin: Jäsenet, Koti, Kalenterit, Pisteet, Älykoti, Tietoturva, Integraatiot ja Tallennus."],
    },
  },
  {
    version: "1.7.0",
    date: "2026-10-27",
    items: {
      sv: ["Appen laddar mindre: bara ditt eget språk hämtas, och det du sett sparas i telefonen eller datorn så att appen startar direkt nästa gång.", "Siffrorna i menyn för chatt och uppgifter uppdateras så fort du ändrar något och när du kommer tillbaka till appen."],
      en: ["The app downloads less: only your own language is fetched, and what you have seen is kept on your phone or computer so the app starts right away next time.", "The numbers in the menu for chat and tasks update as soon as you change something and when you come back to the app."],
      nb: ["Appen laster ned mindre: bare ditt eget språk hentes, og det du har sett lagres på telefonen eller datamaskinen så appen starter med en gang neste gang.", "Tallene i menyen for chat og oppgaver oppdateres så snart du endrer noe og når du kommer tilbake til appen."],
      da: ["Appen henter mindre: kun dit eget sprog hentes, og det, du har set, gemmes på telefonen eller computeren, så appen starter med det samme næste gang.", "Tallene i menuen for chat og opgaver opdateres, så snart du ændrer noget, og når du vender tilbage til appen."],
      fi: ["Sovellus lataa vähemmän: vain oma kielesi haetaan, ja näkemäsi tallennetaan puhelimeesi tai tietokoneellesi, joten sovellus käynnistyy heti seuraavalla kerralla.", "Valikon chat- ja tehtävämäärät päivittyvät heti, kun muutat jotain, ja kun palaat sovellukseen."],
    },
  },
  {
    version: "1.6.0",
    date: "2026-10-27",
    items: {
      sv: ["Snabbare byten mellan apparna: menyn, märkena och din profil ligger kvar när du byter sida i stället för att laddas om varje gång."],
      en: ["Faster switching between apps: the menu, badges and your profile stay put when you change page instead of reloading every time."],
      nb: ["Raskere bytte mellom appene: menyen, merkene og profilen din blir liggende når du bytter side i stedet for å lastes inn på nytt hver gang."],
      da: ["Hurtigere skift mellem apps: menuen, mærkerne og din profil bliver liggende, når du skifter side, i stedet for at blive indlæst igen hver gang."],
      fi: ["Nopeampi siirtyminen sovellusten välillä: valikko, merkit ja profiilisi pysyvät paikallaan sivua vaihtaessa sen sijaan, että ne latautuisivat joka kerta uudelleen."],
    },
  },
  {
    version: "1.5.4",
    date: "2026-10-26",
    items: {
      sv: ["Hela appen laddar snabbare: Kalender, Chatt, Listor, Mat, Foton, Bostad, Fordon, Profil och Inställningar visar direkt det du såg senast medan färsk data hämtas.", "Smarta hemmet är en egen app med alla enheter, scener och flöden du får styra. Stjärnmärk dina favoriter så visas just de på ditt Idag-kort."],
      en: ["The whole app loads faster: Calendar, Chat, Lists, Food, Photos, Home, Vehicles, Profile and Settings show what you saw last right away while fresh data loads.", "Smart home is its own app with every device, scene and automation you may control. Star your favourites and just those show on your Today card."],
      nb: ["Hele appen laster raskere: Kalender, Chat, Lister, Mat, Bilder, Bolig, Kjøretøy, Profil og Innstillinger viser med en gang det du så sist mens ferske data hentes.", "Smarthjem er en egen app med alle enheter, scener og automasjoner du kan styre. Stjernemerk favorittene dine, så vises akkurat de på I dag-kortet ditt."],
      da: ["Hele appen indlæses hurtigere: Kalender, Chat, Lister, Mad, Fotos, Bolig, Køretøjer, Profil og Indstillinger viser straks det, du så sidst, mens friske data hentes.", "Smarthjem er en selvstændig app med alle enheder, scener og automatiseringer, du må styre. Stjernemarkér dine favoritter, så vises netop de på dit I dag-kort."],
      fi: ["Koko sovellus latautuu nopeammin: Kalenteri, Chat, Listat, Ruoka, Kuvat, Asunto, Ajoneuvot, Profiili ja Asetukset näyttävät heti viimeksi nähdyn, kun tuoreet tiedot latautuvat.", "Älykoti on oma sovelluksensa, jossa ovat kaikki laitteet, tilanteet ja automaatiot, joita saat ohjata. Merkitse suosikit tähdellä, niin juuri ne näkyvät Tänään-kortissasi."],
    },
  },
  {
    version: "1.5.3",
    date: "2026-10-26",
    items: {
      sv: ["Idag laddar snabbare: kalendern, smarta hemmet, SL-avgångar och listor visas direkt med senast kända innehåll medan det uppdateras.", "SL-kortet säger nu tydligt när SL inte svarar, och visar då de senast kända avgångarna i stället för ”Inga avgångar”."],
      en: ["Today loads faster: the calendar, smart home, SL departures and lists show their last known content right away while they update.", "The SL card now says clearly when SL isn't answering, and then shows the last known departures instead of “No departures”."],
      nb: ["I dag laster raskere: kalenderen, smarthjemmet, SL-avganger og lister vises med en gang med sist kjente innhold mens de oppdateres.", "SL-kortet sier nå tydelig når SL ikke svarer, og viser da de sist kjente avgangene i stedet for «Ingen avganger»."],
      da: ["I dag indlæses hurtigere: kalenderen, smarthjemmet, SL-afgange og lister vises straks med det senest kendte indhold, mens de opdateres.", "SL-kortet siger nu tydeligt, når SL ikke svarer, og viser så de senest kendte afgange i stedet for »Ingen afgange«."],
      fi: ["Tänään-sivu latautuu nopeammin: kalenteri, älykoti, SL-lähdöt ja listat näkyvät heti viimeksi tunnetulla sisällöllä, kun ne päivittyvät.", "SL-kortti kertoo nyt selvästi, kun SL ei vastaa, ja näyttää silloin viimeksi tunnetut lähdöt ”Ei lähtöjä” -tekstin sijaan."],
    },
  },
  {
    version: "1.5.2",
    date: "2026-10-26",
    items: {
      sv: ["Idag är kortare: kalenderkortet visar de närmaste aktiviteterna och en sammanfattning per dag som går att fälla ut, och Dagens uppgifter visar hur många som är kvar med de klara undanstoppade."],
      en: ["Today is shorter: the calendar card shows the next events plus a per-day summary you can expand, and Today's tasks shows how many are left with finished ones tucked away."],
      nb: ["I dag er kortere: kalenderkortet viser de nærmeste aktivitetene og et sammendrag per dag som kan foldes ut, og Dagens oppgaver viser hvor mange som gjenstår med de ferdige gjemt bort."],
      da: ["I dag er kortere: kalenderkortet viser de næste aktiviteter og en oversigt pr. dag, der kan foldes ud, og Dagens opgaver viser, hvor mange der mangler, med de færdige gemt væk."],
      fi: ["Tänään-sivu on lyhyempi: kalenterikortti näyttää lähimmät tapahtumat ja avattavan päiväkohtaisen yhteenvedon, ja Päivän tehtävät näyttää jäljellä olevien määrän ja piilottaa tehdyt."],
    },
  },
  {
    version: "1.5.1",
    date: "2026-10-26",
    items: {
      sv: ["Chatten på mobilen: skrivfältet syns alltid ovanför menyn och tangentbordet, och konversationerna ligger som en rad överst."],
      en: ["Chat on phones: the message field is always visible above the menu and the keyboard, and conversations sit in a row at the top."],
      nb: ["Chat på mobilen: skrivefeltet vises alltid over menyen og tastaturet, og samtalene ligger som en rad øverst."],
      da: ["Chat på mobilen: skrivefeltet er altid synligt over menuen og tastaturet, og samtalerne ligger som en række øverst."],
      fi: ["Chat puhelimessa: kirjoituskenttä näkyy aina valikon ja näppäimistön yläpuolella, ja keskustelut ovat rivinä ylhäällä."],
    },
  },
  {
    version: "1.5.0",
    date: "2026-10-26",
    items: {
      sv: [
        "Barnen kan föreslå uppgifter. En vuxen godkänner och väljer hur ofta de ska göras, eller avslår med en kort motivering.",
        "Veckopengen kan nu tjänas på två sätt per barn: poäng per krona, eller ett fast belopp varje vecka/månad när barnet når en poänggräns. Både barn och vuxna ser hur det går denna period.",
        "Familjemål: samla poäng tillsammans för att låsa upp något kul, som bowling eller restaurang. Hela familjen får en notis när målet är nått. Finns under Prestationer och som kort på Idag.",
        "Snabbare app: sidorna visar direkt det du såg senast medan färsk data hämtas, och chatten ryms alltid i skärmen med senaste meddelandet längst ner.",
      ],
      en: [
        "Children can suggest tasks. An adult approves and chooses how often they're done, or declines with a short reason.",
        "The allowance can now be earned in two ways per child: points per unit of money, or a fixed amount every week/month the child reaches a point goal. Children and adults see how the current period is going.",
        "Family goals: collect points together to unlock something fun, like bowling or a restaurant. The whole family gets a notification when the goal is reached. Under Achievements and as a card on Today.",
        "Faster app: pages show what you saw last right away while fresh data loads, and the chat always fits the screen with the latest message at the bottom.",
      ],
      nb: [
        "Barna kan foreslå oppgaver. En voksen godkjenner og velger hvor ofte de skal gjøres, eller avslår med en kort begrunnelse.",
        "Ukepengene kan nå tjenes på to måter per barn: poeng per krone, eller et fast beløp hver uke/måned når barnet når en poenggrense. Både barn og voksne ser hvordan perioden går.",
        "Familiemål: samle poeng sammen for å låse opp noe gøy, som bowling eller restaurant. Hele familien får et varsel når målet er nådd. Under Prestasjoner og som kort på I dag.",
        "Raskere app: sidene viser med en gang det du så sist mens ferske data hentes, og chatten får alltid plass på skjermen med siste melding nederst.",
      ],
      da: [
        "Børnene kan foreslå opgaver. En voksen godkender og vælger, hvor ofte de skal laves, eller afviser med en kort begrundelse.",
        "Lommepengene kan nu tjenes på to måder pr. barn: point pr. krone, eller et fast beløb hver uge/måned, når barnet når en pointgrænse. Både børn og voksne ser, hvordan perioden går.",
        "Familiemål: saml point sammen for at låse op for noget sjovt, som bowling eller restaurant. Hele familien får en notifikation, når målet er nået. Under Præstationer og som kort på I dag.",
        "Hurtigere app: siderne viser straks det, du så sidst, mens friske data hentes, og chatten passer altid til skærmen med den seneste besked nederst.",
      ],
      fi: [
        "Lapset voivat ehdottaa tehtäviä. Aikuinen hyväksyy ja valitsee, kuinka usein ne tehdään, tai hylkää lyhyellä perustelulla.",
        "Viikkorahan voi nyt ansaita kahdella tavalla lapsikohtaisesti: pisteinä per rahayksikkö tai kiinteänä summana jokaiselta viikolta/kuukaudelta, jolla lapsi saavuttaa pisterajan. Sekä lapset että aikuiset näkevät jakson tilanteen.",
        "Perheen tavoitteet: keräätte pisteitä yhdessä avataksenne jotain kivaa, kuten keilailun tai ravintolan. Koko perhe saa ilmoituksen, kun tavoite saavutetaan. Saavutuksissa ja korttina Tänään-sivulla.",
        "Nopeampi sovellus: sivut näyttävät heti viimeksi nähdyn sisällön, kun tuoreet tiedot latautuvat, ja chat mahtuu aina näytölle uusin viesti alimpana.",
      ],
    },
  },
  {
    version: "1.4.0",
    date: "2026-10-26",
    items: {
      sv: [
        "Ny app: Veckopeng. Barnen ser vad de tjänat ihop, och vuxna ställer in poäng per krona och registrerar utbetalningar.",
        "Barnens uppgifter kräver som standard godkännande av en vuxen (går att stänga av under Familjeadmin).",
        "Vuxna ser direkt när något väntar på godkännande – en siffra på Uppgifter, en ruta på Idag och en pushnotis.",
        "Uppgifter kan upprepas flera dagar i veckan, varannan (eller var tredje/fjärde) vecka och en gång i månaden.",
        "Ny flik \"Veckan\" under Uppgifter visar hela veckans uppgifter och vem som har gjort vad.",
        "Se dina poäng totalt och vad du har bockat av de senaste 30 dagarna.",
        "Varje uppgift visar vem den är till – eller att vem som helst kan ta den.",
        "Kalenderkortet på Idag visar resten av veckan med det som är inbokat, och det finns en snabbknapp för att lägga till händelser.",
        "Poängligan visar vilken vecka det gäller (måndag–söndag) och allas totalpoäng.",
        "Push-notiser går att slå på på flera enheter, till exempel både mobilen och datorn.",
        "Färgstarkare teman – och tre nya: Bär, Citrus och Norrsken.",
        "Tydligare knapp för att ta bort en lista (listor sparas automatiskt).",
        "Den här sidan: \"Nytt i appen\" i profilmenyn.",
      ],
      en: [
        "New app: Allowance. Children see what they've earned, and adults set points per unit of money and record payouts.",
        "Children's tasks need an adult's approval by default (can be turned off under Family admin).",
        "Adults see right away when something is waiting for approval – a number on Tasks, a box on Today and a push notification.",
        "Tasks can repeat on several days a week, every other (or third/fourth) week and once a month.",
        "New \"Week\" tab under Tasks shows the whole week's tasks and who did what.",
        "See your total points and what you've ticked off in the last 30 days.",
        "Each task shows who it's for – or that anyone can take it.",
        "The calendar card on Today shows the rest of the week with what is booked, and has a shortcut for adding events.",
        "The leaderboard shows which week it covers (Monday–Sunday) and everyone's total points.",
        "Push notifications can be turned on for several devices, e.g. both your phone and your computer.",
        "More colourful themes – and three new ones: Berry, Citrus and Aurora.",
        "Clearer button for deleting a list (lists are saved automatically).",
        "This page: \"What's new\" in the profile menu.",
      ],
      nb: [
        "Ny app: Ukepenger. Barna ser hva de har tjent, og voksne stiller inn poeng per krone og registrerer utbetalinger.",
        "Barnas oppgaver må som standard godkjennes av en voksen (kan slås av under Familieadmin).",
        "Voksne ser med en gang når noe venter på godkjenning – et tall på Oppgaver, en boks på I dag og et push-varsel.",
        "Oppgaver kan gjentas flere dager i uken, annenhver (eller hver tredje/fjerde) uke og én gang i måneden.",
        "Ny fane \"Uken\" under Oppgaver viser hele ukens oppgaver og hvem som har gjort hva.",
        "Se poengene dine totalt og hva du har krysset av de siste 30 dagene.",
        "Hver oppgave viser hvem den er til – eller at hvem som helst kan ta den.",
        "Kalenderkortet på I dag viser resten av uken med det som er booket, og det finnes en snarvei for å legge til hendelser.",
        "Poengligaen viser hvilken uke det gjelder (mandag–søndag) og alles totalpoeng.",
        "Push-varsler kan slås på for flere enheter, for eksempel både mobilen og datamaskinen.",
        "Mer fargerike temaer – og tre nye: Bær, Sitrus og Nordlys.",
        "Tydeligere knapp for å slette en liste (lister lagres automatisk).",
        "Denne siden: \"Nytt i appen\" i profilmenyen.",
      ],
      da: [
        "Ny app: Lommepenge. Børnene ser, hvad de har tjent, og voksne indstiller point pr. krone og registrerer udbetalinger.",
        "Børnenes opgaver skal som standard godkendes af en voksen (kan slås fra under Familieadmin).",
        "Voksne ser med det samme, når noget venter på godkendelse – et tal på Opgaver, en boks på I dag og en push-notifikation.",
        "Opgaver kan gentages flere dage om ugen, hver anden (eller tredje/fjerde) uge og én gang om måneden.",
        "Ny fane \"Ugen\" under Opgaver viser hele ugens opgaver, og hvem der har gjort hvad.",
        "Se dine point i alt, og hvad du har krydset af de seneste 30 dage.",
        "Hver opgave viser, hvem den er til – eller at alle kan tage den.",
        "Kalenderkortet på I dag viser resten af ugen med det, der er booket, og der er en genvej til at tilføje begivenheder.",
        "Pointligaen viser, hvilken uge det gælder (mandag–søndag), og alles samlede point.",
        "Push-notifikationer kan slås til på flere enheder, fx både mobilen og computeren.",
        "Mere farverige temaer – og tre nye: Bær, Citrus og Nordlys.",
        "Tydeligere knap til at slette en liste (lister gemmes automatisk).",
        "Denne side: \"Nyt i appen\" i profilmenuen.",
      ],
      fi: [
        "Uusi sovellus: Viikkoraha. Lapset näkevät ansionsa, ja aikuiset asettavat pisteet per rahayksikkö ja kirjaavat maksut.",
        "Lasten tehtävät vaativat oletuksena aikuisen hyväksynnän (voi poistaa käytöstä Perheen hallinnassa).",
        "Aikuiset näkevät heti, kun jokin odottaa hyväksyntää – numero Tehtävissä, laatikko Tänään-sivulla ja push-ilmoitus.",
        "Tehtävät voivat toistua useana päivänä viikossa, joka toinen (tai kolmas/neljäs) viikko ja kerran kuukaudessa.",
        "Uusi \"Viikko\"-välilehti Tehtävissä näyttää koko viikon tehtävät ja kuka teki mitä.",
        "Näe kokonaispisteesi ja mitä olet kuitannut viimeisen 30 päivän aikana.",
        "Jokainen tehtävä näyttää, kenelle se kuuluu – tai että kuka tahansa voi tehdä sen.",
        "Tänään-sivun kalenterikortti näyttää loppuviikon varatut tapahtumat, ja tapahtumien lisäämiseen on pikanäppäin.",
        "Pistetaulukko näyttää, mistä viikosta on kyse (maanantai–sunnuntai) ja kaikkien kokonaispisteet.",
        "Push-ilmoitukset voi ottaa käyttöön useilla laitteilla, esim. sekä puhelimessa että tietokoneella.",
        "Värikkäämmät teemat – ja kolme uutta: Marja, Sitrus ja Revontulet.",
        "Selkeämpi painike listan poistamiseen (listat tallentuvat automaattisesti).",
        "Tämä sivu: \"Uutta sovelluksessa\" profiilivalikossa.",
      ],
    },
  },
  {
    version: "1.3.0",
    date: "2026-10-24",
    items: {
      sv: [
        "Lägg till egna händelser i kalendern och tagga vilka i familjen de gäller.",
        "Händelser från prenumererade kalendrar visar vilken kalender de kommer ifrån.",
        "Redigera uppgifter fullt ut – till exempel ändra vem som ska göra dem.",
        "Uppgiftskortet på Idag visar bara dina egna uppgifter och de som alla kan ta.",
        "Ny mobilmeny med stora knappar och \"Mer\".",
        "Välj själv ordning och vilka appar som syns under Profil → Min meny.",
        "Rapportera fel och önskemål direkt från appen.",
        "Korten på Idag ligger kant i kant utan tomrum.",
      ],
      en: [
        "Add your own events to the calendar and tag who in the family they're for.",
        "Events from subscribed calendars show which calendar they come from.",
        "Edit tasks fully – for example change who should do them.",
        "The task card on Today only shows your own tasks and the ones anyone can take.",
        "New phone menu with big buttons and \"More\".",
        "Choose the order of the apps and which ones you see under Profile → My menu.",
        "Report problems and wishes straight from the app.",
        "The cards on Today sit edge to edge without gaps.",
      ],
      nb: [
        "Legg til egne hendelser i kalenderen og merk hvem i familien de gjelder.",
        "Hendelser fra abonnerte kalendere viser hvilken kalender de kommer fra.",
        "Rediger oppgaver fullt ut – for eksempel endre hvem som skal gjøre dem.",
        "Oppgavekortet på I dag viser bare dine egne oppgaver og de alle kan ta.",
        "Ny mobilmeny med store knapper og \"Mer\".",
        "Velg selv rekkefølgen og hvilke apper som vises under Profil → Min meny.",
        "Rapporter feil og ønsker rett fra appen.",
        "Kortene på I dag ligger kant i kant uten mellomrom.",
      ],
      da: [
        "Tilføj egne begivenheder i kalenderen, og marker hvem i familien de gælder.",
        "Begivenheder fra abonnerede kalendere viser, hvilken kalender de kommer fra.",
        "Rediger opgaver fuldt ud – for eksempel ændre hvem der skal lave dem.",
        "Opgavekortet på I dag viser kun dine egne opgaver og dem, alle kan tage.",
        "Ny mobilmenu med store knapper og \"Mere\".",
        "Vælg selv rækkefølgen, og hvilke apps der vises, under Profil → Min menu.",
        "Rapportér fejl og ønsker direkte fra appen.",
        "Kortene på I dag ligger kant i kant uden mellemrum.",
      ],
      fi: [
        "Lisää omia tapahtumia kalenteriin ja merkitse, ketä perheessä ne koskevat.",
        "Tilattujen kalenterien tapahtumat näyttävät, mistä kalenterista ne tulevat.",
        "Muokkaa tehtäviä kokonaan – esimerkiksi vaihda, kuka ne tekee.",
        "Tänään-sivun tehtäväkortti näyttää vain omat tehtäväsi ja ne, jotka kuka tahansa voi tehdä.",
        "Uusi puhelinvalikko isoilla painikkeilla ja \"Lisää\"-kohdalla.",
        "Valitse itse sovellusten järjestys ja näkyvyys kohdassa Profiili → Oma valikko.",
        "Ilmoita virheistä ja toiveista suoraan sovelluksesta.",
        "Tänään-sivun kortit ovat reunasta reunaan ilman välejä.",
      ],
    },
  },
  {
    version: "1.2.0",
    date: "2026-10-24",
    items: {
      sv: [
        "Smooth Family körs på familjens egen server med eget domännamn och HTTPS.",
        "Logga in med passkey (Face ID/fingeravtryck) eller kod från en autentiseringsapp.",
        "Bilder och GIF:ar i chatten, och du kan byta ditt eget lösenord under Profil.",
      ],
      en: [
        "Smooth Family runs on the family's own server with its own domain name and HTTPS.",
        "Sign in with a passkey (Face ID/fingerprint) or a code from an authenticator app.",
        "Images and GIFs in the chat, and you can change your own password under Profile.",
      ],
      nb: [
        "Smooth Family kjører på familiens egen server med eget domenenavn og HTTPS.",
        "Logg inn med passnøkkel (Face ID/fingeravtrykk) eller kode fra en autentiseringsapp.",
        "Bilder og GIF-er i chatten, og du kan endre ditt eget passord under Profil.",
      ],
      da: [
        "Smooth Family kører på familiens egen server med eget domænenavn og HTTPS.",
        "Log ind med adgangsnøgle (Face ID/fingeraftryk) eller en kode fra en godkendelsesapp.",
        "Billeder og GIF'er i chatten, og du kan ændre din egen adgangskode under Profil.",
      ],
      fi: [
        "Smooth Family toimii perheen omalla palvelimella omalla verkkotunnuksella ja HTTPS:llä.",
        "Kirjaudu pääsyavaimella (Face ID/sormenjälki) tai todennussovelluksen koodilla.",
        "Kuvat ja GIFit chatissa, ja voit vaihtaa oman salasanasi Profiilissa.",
      ],
    },
  },
];

export const LATEST_VERSION = RELEASE_NOTES[0].version;

const SEEN_KEY = "sf.whatsNew.seen";

// Per-device convenience: which release notes this browser has opened.
export function seenVersion(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function markSeen(version: string = LATEST_VERSION): void {
  try {
    window.localStorage.setItem(SEEN_KEY, version);
  } catch {
    // Private mode or blocked storage: the dot just stays.
  }
}
