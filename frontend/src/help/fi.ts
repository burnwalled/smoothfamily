// Help texts (fi): every topic in topics.ts, with the same blocks as en.ts (help.test.ts checks it).
import type { TopicText } from "./types";

const texts: Record<string, TopicText> = {
  "start": {
    "title": "Aloitus",
    "summary": "Mikä Smooth Family on, miten sovellus on rakennettu ja mistä löydät asiat.",
    "blocks": [
      {
        "p": "Smooth Family on perheen oma sovellus kalenteriin, listoihin, tehtäviin, ruokaan, kotiin ja älykotiin. Se toimii palvelimella kotonanne – NAS-laitteella tai pienellä tietokoneella – joten kuvanne, viestinne ja suunnitelmanne pysyvät teillä. Mitään ei lähetetä suurille yrityksille, ja tekoäly on paikallinen ja päällä vain, jos niin haluatte."
      },
      {
        "shot": "today",
        "caption": "Tänään kokoaa päivän: kalenterin, tehtävät, sään ja muuta."
      },
      {
        "h": "Asenna se sovellukseksi"
      },
      {
        "steps": [
          "Avaa perheen osoite puhelimen selaimessa ja kirjaudu sisään.",
          "iPhone: napauta Jaa → Lisää Koti-valikkoon. Android: napauta ⋮ → Asenna sovellus (tai Lisää aloitusnäytölle).",
          "Avaa Smooth Family aloitusnäytöltä – se käynnistyy koko näytölle ja voi lähettää ilmoituksia."
        ]
      },
      {
        "h": "Näin löydät perille"
      },
      {
        "p": "Puhelimessa käytetyimmät sovellukset ovat alareunan palkissa ja muut kohdassa Lisää; tietokoneella ne ovat vasemman reunan valikossa. Yhteen kuuluvat sovellukset ovat välilehtiä sivun yläreunassa – Kalenterissa ovat Matkat, Kaksi kotia ja Sunnuntaikatsaus, Ruoassa Reseptikirja ja Ruokakomero."
      },
      {
        "p": "Asetuksia on kolmella tasolla, kaikki kuvasi takana olevassa valikossa: Oma profiili (omasi), Perheen asetukset (perhettä hoitavalle) ja Palvelimen asetukset (palvelinta hoitavalle)."
      },
      {
        "tips": [
          "Sivun otsikon vieressä oleva kysymysmerkki avaa sen sivun ohjeen.",
          "Muuta valikon järjestystä tai piilota sovellukset, joita et käytä, kohdassa Oma profiili → Valikko.",
          "Sen, mitä sovelluksia kukin näkee, valitsee perheen ylläpitäjä kohdassa Perheen asetukset → Perheenjäsenet."
        ]
      }
    ]
  },
  "signin": {
    "title": "Kirjautuminen ja turvallisuus",
    "summary": "Salasanat, pääsyavaimet Face ID:llä tai sormenjäljellä ja kaksivaiheiset koodit.",
    "blocks": [
      {
        "p": "Kirjaudut sisään käyttäjätunnuksellasi ja salasanallasi. Aikuisten salasanoissa on vähintään 12 merkkiä, ellei palvelimen ylläpitäjä ole valinnut toisin – pituus tekee salasanasta vaikean murtaa. Lapsilla voi olla lyhyempiä."
      },
      {
        "h": "Pääsyavaimet – kirjaudu kasvoilla tai sormella"
      },
      {
        "steps": [
          "Avaa Oma profiili → Turvallisuus ja yhteydet.",
          "Napauta Lisää pääsyavain ja seuraa puhelimen tai tietokoneen ohjeita.",
          "Valitse ensi kerralla kirjautumissivulla Kirjaudu pääsyavaimella."
        ]
      },
      {
        "shot": "signin",
        "caption": "Pääsyavaimet ja kaksivaiheiset koodit kohdassa Oma profiili."
      },
      {
        "h": "Kaksivaiheiset koodit"
      },
      {
        "p": "Kaksivaiheisessa kirjautumisessa kirjoitat salasanan jälkeen kuusinumeroisen koodin sovelluksesta, kuten Microsoft tai Google Authenticator. Palvelimen ylläpitäjä voi tehdä niistä pakollisia aikuisille. Ne toimivat ilman yhteyttä – mitään ulkoista palvelua ei käytetä."
      },
      {
        "tips": [
          "Unohditko salasanan? Kysy perheen ylläpitäjältä, joka asettaa uuden kohdassa Perheen asetukset → Perheenjäsenet.",
          "Kadotitko puhelimen, jossa koodit ovat? Ylläpitäjä voi nollata kaksivaiheisen kirjautumisesi samassa paikassa.",
          "Pääsyavain kuuluu osoitteeseen, jossa se luotiin; jos perheen osoite vaihtuu, luo uusi."
        ]
      }
    ]
  },
  "notifications": {
    "title": "Ilmoitukset ja aamuyhteenveto",
    "summary": "Kello, ilmoitukset puhelimeen ja päivän yhteenveto joka aamu.",
    "blocks": [
      {
        "p": "Kaikki, mitä sinulle tapahtuu – hyväksyttävä tehtävä, viesti, muistutus, lääkeannos – päätyy yläreunan kellon alle. Numero kertoo, montako et ole lukenut. Samat ilmoitukset voi myös lähettää puhelimeen."
      },
      {
        "shot": "notifications",
        "caption": "Ilmoituskeskus säilyttää kaiken, luetun ja lukemattoman."
      },
      {
        "h": "Puhelimessa"
      },
      {
        "steps": [
          "Avaa Oma profiili → Ilmoitukset.",
          "Ota ilmoitukset käyttöön tällä laitteella ja salli ne, kun puhelin kysyy.",
          "Valitse, mitä lähetetään – loput päätyvät silti kellon alle."
        ]
      },
      {
        "p": "Aamuyhteenveto on yksi ilmoitus valitsemaasi aikaan – arkisin tai joka päivä – päivän tapahtumista, tehtävistäsi ja lääkkeistäsi, koulun ruokalistasta ja säästä."
      },
      {
        "tips": [
          "iPhone: ilmoitukset toimivat vain, kun Smooth Family on lisätty Koti-valikkoon.",
          "Jokainen laite otetaan käyttöön erikseen – puhelin ja tabletti tarvitsevat sen kumpikin."
        ]
      }
    ]
  },
  "offline": {
    "title": "Ilman kenttää",
    "summary": "Listat ja tehtävät toimivat kaupassa ilman yhteyttä.",
    "blocks": [
      {
        "p": "Smooth Family säilyttää sen, mitä olet avannut, joten sovellus toimii yhteyden kadotessa. Ostoslistalla voit kuitata, lisätä ja poistaa, ja voit kuitata tehtäviä. Muutokset näkyvät heti ja merkitään pienellä pilvellä, kunnes ne on lähetetty."
      },
      {
        "p": "Yläreunan merkki kertoo, että olet offline-tilassa ja montako muutosta odottaa. Kun yhteys palaa, ne lähetetään itsestään siinä järjestyksessä kuin teit ne."
      },
      {
        "tips": [
          "Muut sivut näyttävät viimeksi ladatun, mutta niitä ei voi muuttaa ennen kuin olet taas verkossa.",
          "Jos joku muu muutti saman asian sillä välin, viimeisin muutos jää voimaan."
        ]
      }
    ]
  },
  "today": {
    "title": "Tänään",
    "summary": "Perheen päivä yhdellä sivulla – itse valitsemillasi korteilla.",
    "blocks": [
      {
        "p": "Tänään on ensimmäinen sivu. Se näyttää sen, mikä on nyt tärkeää: viikon kalenterin, tehtäväsi, ostoslistan, sään, sähkön hinnan, jätehuollon, koulun ruokalistan, ruokakomerosta pian syötävät, kodin ja ajoneuvojen tulevat asiat, kuka on kotona – ja muuta."
      },
      {
        "shot": "today",
        "caption": "Jokaisen kortin voi siirtää, lisätä tai poistaa."
      },
      {
        "steps": [
          "Napauta Muokkaa Tänään-sivun alareunassa.",
          "Lisää kortteja kohdasta Lisää widget, vedä ne haluamaasi järjestykseen tai poista ne.",
          "Napauta Valmis."
        ]
      },
      {
        "tips": [
          "Lähdöt: lisää kortti pysäkkiä kohden kohdassa Lisää widget – SL Tukholmassa tai muu lähde koko Ruotsille, Norjalle, Suomelle, Tanskalle tai Lontoolle (osa tarvitsee avaimen, jonka palvelimen ylläpitäjä lisää kohdassa Palvelin → Osoite ja palvelut).",
          "Korttien lähteet – sään paikkakunta, jätehuollon kalenteri ja koulu – asetetaan kohdassa Perheen asetukset → Arki.",
          "Korttia sovellukselle, jota et saa käyttää, ei näytetä."
        ]
      }
    ]
  },
  "calendar": {
    "title": "Kalenteri",
    "summary": "Perheen kalenteri koulun ja seurojen kalentereineen, kuka ajaa ja mitä pakataan.",
    "blocks": [
      {
        "p": "Kalenteri näyttää perheen omat tapahtumat yhdessä tilattujen kalenterien kanssa – koulu, urheiluseura, työ. Vaihda tunneittaisen viikon, kuukauden ja listan välillä. Usean päivän tapahtumat ovat palkki niiden yli, ja viikkonumero on reunassa."
      },
      {
        "shot": "calendar",
        "caption": "Viikko tunneittain."
      },
      {
        "h": "Lisää tapahtuma"
      },
      {
        "p": "Napauta + Uusi tapahtuma, anna sille otsikko ja aika ja valitse, ketä se koskee – tai anna sen koskea kaikkia. Perheen tapahtumat jaetaan kaikille perheessä."
      },
      {
        "h": "Kuka ajaa ja mitä pakataan"
      },
      {
        "p": "Napauta tapahtuman vieressä Kyydit ja pakkaus – kalenterissa tai sunnuntaikatsauksessa – kertoaksesi, että kyyti tarvitaan, ja ota vienti tai haku – tai kirjoita kohdassa Joku muu, kuka perheen ulkopuolelta ajaa, esimerkiksi joukkuekaverin vanhempi. Anna sille pakkauslista: sama lista palaa jokaiseen samannimiseen tapahtumaan, kuten jokaiseen jalkapalloharjoitukseen, ja kuitataan joka kerta. Aikuinen voi valita päivän, jolloin on aika pakata, ja menijä saa sinä päivänä tehtävän."
      },
      {
        "shot": "calendar-month",
        "caption": "Kuukausi kirjoittaa auki, mitä kunakin päivänä tapahtuu."
      },
      {
        "h": "Tilaa kalenteri"
      },
      {
        "p": "Kalenterit luetaan yksityisen iCal-linkin kautta. Näin löydät linkin yleisimmistä palveluista:"
      },
      {
        "details": [
          {
            "title": "Google-kalenteri (Gmail)",
            "blocks": [
              {
                "steps": [
                  "Avaa calendar.google.com tietokoneella – linkkiä ei löydy mobiilisovelluksesta.",
                  "Vasemmassa sarakkeessa kohdassa \"Omat kalenterit\": vie hiiri kalenterin päälle ja valitse ⋮ → \"Asetukset ja jakaminen\".",
                  "Vieritä kohtaan \"Integroi kalenteri\".",
                  "Kopioi \"Salainen osoite iCal-muodossa\" (päättyy .ics). Älä käytä \"Julkista osoitetta\" – se toimii vain, jos kalenteri on julkinen."
                ]
              },
              {
                "note": "Työ- tai koulutilit: ylläpitäjä on voinut poistaa salaisen osoitteen käytöstä. Jos sitä ei ole, kysy ylläpitäjältä tai käytä henkilökohtaista tiliä."
              }
            ]
          },
          {
            "title": "Outlook / Microsoft 365",
            "blocks": [
              {
                "steps": [
                  "Avaa selaimessa outlook.com (henkilökohtainen tili) tai outlook.office.com (työ/koulu).",
                  "Valitse ratas (Asetukset) → Kalenteri → Jaetut kalenterit.",
                  "Kohdassa \"Julkaise kalenteri\": valitse kalenteri ja \"Voi nähdä kaikki tiedot\" ja valitse Julkaise.",
                  "Kopioi ICS-linkki – ei HTML-linkkiä."
                ]
              },
              {
                "note": "Perinteinen Outlook for Windows ei voi julkaista kalentereita – käytä Outlookin verkkoversiota tai uutta Outlookia. Työtileillä ylläpitäjä on voinut estää julkaisun."
              }
            ]
          },
          {
            "title": "iCloud (iPhone / Mac)",
            "blocks": [
              {
                "steps": [
                  "Avaa iPhonessa Kalenteri-sovellus ja napauta alhaalla \"Kalenterit\".",
                  "Napauta (i) lisättävän kalenterin vieressä.",
                  "Ota käyttöön \"Julkinen kalenteri\" ja napauta \"Jaa linkki…\" → Kopioi.",
                  "Linkki alkaa webcal:// – liitä se sellaisenaan."
                ]
              },
              {
                "note": "\"Julkinen\" tarkoittaa, että kuka tahansa linkin saanut voi lukea kalenteria. Sitä ei listata missään, mutta pidä linkki yksityisenä."
              }
            ]
          },
          {
            "title": "SportAdmin (seuran ja joukkueen toiminta)",
            "blocks": [
              {
                "steps": [
                  "Avaa SportAdmin-sovellus ja siirry kohtaan \"Aktiviteter\" (Aktiviteetit).",
                  "Napauta kalenterikuvaketta oikeassa yläkulmassa.",
                  "Valitse linkin kopiointi (suora tilaus lisää kalenterin vain puhelimeesi).",
                  "Liitä linkki Smooth Familyyn. Se alkaa yleensä webcal://cal.sportadmin.se/."
                ]
              },
              {
                "note": "Eikö aktiviteetteja näy? Joukkueen täytyy olla liitetty seuran kalenteriin SportAdminissa – kysy joukkueenjohtajalta. Monilla seurasivuilla on myös \"Prenumerera\"-painike kalenterisivulla: napsauta sitä hiiren oikealla ja kopioi linkin osoite. Lisää yksi tilaus joukkuetta kohden ja anna kullekin oma värinsä."
              }
            ]
          },
          {
            "title": "MyClub (seuran ja joukkueen kalenteri)",
            "blocks": [
              {
                "steps": [
                  "Avaa seuran MyClub-sivusto (seuranimi.myclub.se) ja siirry joukkueen kalenteriin tai sivulle, jolla kerrotaan kalenterin tilaamisesta.",
                  "Kopioi tilauslinkki. Joukkueen linkki on muotoa webcal://calendar.myclub.se/public/teams/12345/calendar.ics – koko seuran linkissä on sen sijaan /public/clubs/.",
                  "Liitä linkki Smooth Familyyn."
                ]
              },
              {
                "note": "Etkö löydä linkkiä? Pyydä joukkueenjohtajalta kalenterin tilauslinkki – se on sama, jonka seura antaa iPhonea ja Googlea varten. Lisää yksi tilaus joukkuetta kohden, anna kullekin oma värinsä ja valitse lapsi, jota se koskee."
              }
            ]
          },
          {
            "title": "laget.se (seuran ja joukkueen kalenteri)",
            "blocks": [
              {
                "steps": [
                  "Avaa joukkueen sivu laget.se-palvelussa, esimerkiksi laget.se/Joukkue.",
                  "Siirry kohtaan Kalender ja napsauta kalenterin alla Prenumerera (tilaa).",
                  "Kopioi linkki. Se on muotoa webcal://cal.laget.se/Joukkue.ics – sama nimi kuin joukkueen laget.se-osoitteessa.",
                  "Liitä linkki Smooth Familyyn."
                ]
              },
              {
                "note": "laget.se-kalenteri näyttää kuukauden taaksepäin ja kuusi kuukautta eteenpäin. Lisää yksi tilaus joukkuetta kohden, anna kullekin oma värinsä ja valitse lapsi, jota se koskee."
              }
            ]
          },
          {
            "title": "Lisää linkki Smooth Familyyn",
            "blocks": [
              {
                "steps": [
                  "Avaa profiilivalikko (oikealla ylhäällä) → Perheen asetukset → Kalenteritilaukset.",
                  "Kirjoita kaikille tuttu nimi, esim. \"Koulu\" tai \"Edvin – jalkapallo\".",
                  "Liitä linkki ja valitse väri.",
                  "Valitse Lisää. Tapahtumat näkyvät kalenterissa ja Tänään-sivulla."
                ]
              }
            ]
          },
          {
            "title": "Eikö jokin toimi?",
            "blocks": [
              {
                "tips": [
                  "Uusien tapahtumien näkyminen voi kestää jopa 15 minuuttia – kalenterit välimuistitetaan, jotta palveluita ei kuormiteta.",
                  "Virhe lisättäessä? Tarkista, että linkki alkaa https:// tai webcal:// ja että kopioit iCal/ICS-linkin etkä verkkosivun linkkiä.",
                  "Onko linkki vuotanut? Luo uusi palveluntarjoajalla (Google: \"Nollaa\" salainen osoite) ja vaihda se tähän."
                ]
              }
            ]
          }
        ]
      },
      {
        "tips": [
          "Tilatut kalenterit ovat vain luettavia ja päivittyvät 15 minuutin välein.",
          "Oman kalenterisi voi lisätä puhelimeen tilauslinkillä kohdassa Oma profiili."
        ]
      },
      {
        "h": "Punaiset päivät"
      },
      {
        "p": "Maan pyhäpäivät näkyvät kalenterissa punaisina päivinä, ja pyhäpäivien tavoin vietetyt aatot (jouluaatto, juhannusaatto …) vaaleammalla punaisella. Valitse maa – tai poista käytöstä – kohdassa Perheen asetukset → Arki. Muun maan pyhäpäivät saat lisäämällä julkisen pyhäpäiväkalenterin tilauksena."
      }
    ]
  },
  "trips": {
    "title": "Matkat",
    "summary": "Suunnitelkaa matka yhdessä: päivät, matkasuunnitelma, pakkaaminen henkilöittäin ja budjetti.",
    "blocks": [
      {
        "p": "Matkalla on päivät ja kohde – se näkyy kalenterissa – sekä lähtijät. Lisää matkasuunnitelma kulkemisineen, majoituksineen ja aktiviteetteineen (liput voi linkittää holvista), yhteinen budjetti ja tarkistuslista ennen lähtöä, kuten veden sulkeminen."
      },
      {
        "shot": "trips",
        "caption": "Pakkaaminen matkustajittain, valmiilla listoilla."
      },
      {
        "h": "Pakkaaminen"
      },
      {
        "p": "Jokaisella matkustajalla on oma pakkauslistansa ja lisäksi yhteinen. Aloita pohjasta – ranta, laskettelu tai viikonloppu – ja lisää loput. Aikuinen voi valita päivän, jolloin on aika pakata: jokainen matkustaja saa silloin tehtävän pisteineen ja linkin omaan listaansa."
      },
      {
        "tips": [
          "Lähtöä edeltävänä iltana kaikkia lähtijöitä muistutetaan siitä, mitä on vielä pakattava ja tarkistettava.",
          "Lapset näkevät ja pakkaavat omat tavaransa; aikuiset suunnittelevat loput."
        ]
      }
    ]
  },
  "parties": {
    "title": "Juhlat",
    "summary": "Suunnitelkaa juhlat yhdessä – yksi kutsusivu vieraille ja teille tarkistuslista, budjetti ja aikataulu.",
    "blocks": [
      {
        "p": "Kalenteri → Juhlat -kohdassa suunnittelet lastenjuhlat, juhlat, illallisen, otteluillan, grilli-illan tai ulkoilupäivän. Vieraat saavat yhteisen sivun – ilman tiliä – ensin halutessanne merkitse päivä -sivun, sitten kutsun, jossa he vastaavat nimellä, allergioilla ja seuralaisilla sallimissanne rajoissa, juhlapäivänä portaalin kuvilleen ja lopuksi kiitoksen. He voivat muuttaa vastaustaan myöhemmin. Valitsette, mitä he näkevät toisistaan: ei mitään, montako tulee tai nimet."
      },
      {
        "shot": "parties",
        "caption": "Juhlien seitsemän vaihetta – tässä Ulkoasu, joka alkaa malleista."
      },
      {
        "steps": [
          "Kalenteri → Juhlat → Uudet juhlat: nimi, laji, kenen juhlat, aika ja paikka – sitten juhlat vievät sinut seitsemän vaiheen läpi.",
          "1 Tiedot ja teema · 2 Ulkoasu: merkitse päivä, kutsu, juhlaportaali ja kiitos, kullakin oma juliste · 3 Vieraat: ketkä tulevat, allergiat, sähköpostiosoitteet – ja oma kutsuttujen lista.",
          "4 Tehtävät – ennen, aikana ja jälkeen · 5 Budjetti · 6 Ohjelma, jonka kohtia voi piilottaa vierailta · 7 Lähetykset: viestit ajallaan (palvelimen sähköpostilla) tai linkit jaettavaksi itse."
        ]
      },
      {
        "shot": "partyinvite",
        "caption": "Vieraiden kutsu: juliste juhlien teemassa, tiedot, kalenteripainikkeet ja vastaus."
      },
      {
        "h": "Suunnittelu"
      },
      {
        "p": "Uudet juhlat alkavat lajilleen sopivalla tarkistuslistalla – ennen, aikana ja jälkeen – päivämäärineen; aikuisia muistutetaan aamulla, kun jotain on tehtävä. Muokkaa sitä vapaasti. Budjetti seuraa kuluja suunniteltuun nähden ja ohjelma päivän aikoja (lastenjuhlat alkavat valmiilla ohjelmalla) – kohdan voi piilottaa vierailta portaalissa."
      },
      {
        "shot": "partyportal",
        "caption": "Juhlaportaali QR-koodista: vieraiden kuvat, päivän ohjelma ja muuta."
      },
      {
        "tips": [
          "Jokainen juliste voi näyttää erilaiselta tietokoneella ja puhelimessa: valitse julisteen muokkaimessa Puhelin, niin muuttamasi järjestys, näkyvyys, tasaus ja koko koskevat vain puhelinta. Tekstit ja kuvat ovat yhteisiä, joten korjaus näkyy molemmissa. Ennen muutoksia puhelin seuraa tietokonetta. Leveät tabletit lasketaan tietokoneiksi, kapeat puhelimiksi.",
          "Mallit (Ulkoasu → Mallit) asettavat kaikki julisteet ja ulkoasun kerralla: valmis Gaala tai omanne – tallentakaa mitkä tahansa juhlat mallina. Tai tehkää malli omalla tekoälyllä: kirjoittakaa toiveet, kopioikaa kehote haluamaanne tekoälyyn ja liittäkää vastaus takaisin. Näette mallin ennen käyttöä, sisään tulee vain se, minkä julisteet tuntevat (ei koodia, ei ulkopuolisia kuvia), ja kaikkea voi muuttaa jälkeenpäin. Mallin voi myös tallentaa tiedostona ja avata toisessa perheessä.",
          "Yksi linkki alusta loppuun: tallenna päivä -sivulla vieraat rekisteröityvät nimellä ja sähköpostilla. Kutsuviesti antaa jokaiselle henkilökohtaisen linkin, jolla vastata. Kun he avaavat sen uudelleen, he näkevät vastauksensa ja voivat muuttaa sitä. Vastaamattomat saavat muistutuksen itsestään ennen viimeistä vastauspäivää (Lähetykset). Ulkoasu-kohdassa asettamastanne ajasta sama linkki avaa juhlaportaalin, ja Kiitos-kohdassa asettamananne aikana kiitos lähtee tulleille.",
          "Yksi juhla, neljä sivua samassa teemassa, kullakin oma juliste (Juliste): ensin halutessanne merkitse päivä -sivu – vieraat tallentavat päivän ja jättävät sähköpostinsa ja saavat viestin, kun vaihdatte linkin kutsuun – sitten kutsu, juhlaportaali ja kiitos. Liitä Spotifyn yhteissoittolista, niin vieraat voivat toivoa kappaleita. Avaa juhlaportaali ja tulosta sen QR-koodi pöytiin: vieraat lataavat kuvansa suoraan Holvin albumiin ja näkevät päivän ohjelman.",
          "Sovelluksessa on kuvakirjasto: taustat ja yläkuvat moniin teemoihin sekä tarroja – ilmapallot, diskopallo, rapu, ylioppilaslakki, sormukset, kurpitsa ja muuta – julisteeseen emojien tilalle (Juliste → koristerivi tai tunnus → Kirjasto).",
          "Juliste-kohdassa teette kutsusivusta omannäköisen: lisää, siirrä ja poista sen osia (tekstit, kuvat, tunnus, koristerivi, milloin ja missä lippuna, korttina, listana tai isona päivämääränä, lähtölaskenta, kalenteripainikkeet, kutsu, nauha). Kirjoita jokainen teksti omalla kirjasimella, koolla, tasauksella ja värillä – {nimi}, {päivä} ja vastaavat täyttyvät itsestään. Vaihda emojit toisiin tai omiin kuviin ja valitse, mitkä kalenteripainikkeet vieraat saavat: kalenteritiedosto (se avaa Applen Kalenterin iPhonessa ja Macissa sekä useimmat muut), Google tai Outlook. Teeman juliste on aina yhden napautuksen päässä.",
          "Päivää ei ole vielä sovittu: rastita Anna vieraiden äänestää päivästä ja lisää teille sopivat päivät. Vieraat rastittavat heille sopivat; Kutsu-kohdassa näette, kuinka monelle kukin päivä sopii, ja valitsette yhden – silloin juhlat lisätään kalenteriin, sille äänestäneet lasketaan tuleviksi ja päivityksiä pyytäneet saavat sähköpostin.",
          "Valitse, mitä kukin vieras saa tuoda: ei ketään, +1 tai perheensä – silloin he lisäävät koko seurueen, jokaisen allergioineen ja tiedon, onko kyseessä lapsi. Illallinen, grilli-ilta tai ulkoilupäivä alkaa perheillä.",
          "Valitse teema kutsusivulle ja toinen kiitossivulle – juhlaan sopivat ensin (ilmapallot, merirosvot ja dinosaurukset lastenjuhliin; disko, glitter, 80-luku ja samppanja juhliin; bistro, joulu ja rapujuhlat illalliselle; jalkapallo ja jääkiekko otteluun; grilli, polttopallo ja uimaranta ulos). Tai luo oma: värit, kuvio, emojit ja omat kuvat ylhäälle ja taustalle – tallessa myöhempää varten. Oman kuvan voi lisätä myös kutsuun.",
          "Vieraat, jotka antavat sähköpostinsa ja pyytävät päivityksiä, saavat vahvistuksen, viestin jos aika tai paikka muuttuu, muistutuksen edellisenä päivänä ja kiitoksen – sekä viestit, jotka lähetätte kohdasta Vieraat. Se vaatii palvelimen sähköpostin, jonka ylläpitäjä asettaa kohdassa Palvelin → Osoite ja palvelut.",
          "Juhlat lisätään kalenteriin itsestään – kaikille, joita ne koskevat (rastita yksi tai useampi perheestä), ja valitsette, kenen toivelista näkyy kutsussa.",
          "Näytä toivelista: vieraat näkevät päivänsankarin toiveet ja merkitsevät, mitä ostavat; lahjan saaja ei koskaan näe kuka.",
          "Jälkeenpäin, kohdassa Kiitos: kiitosteksti ja kuvat Holvin albumista samalle sivulle, joka vierailla jo on.",
          "Vain aikuiset suunnittelevat juhlia – toivelistan varaukset näkyvät suunnittelussa."
        ]
      }
    ]
  },
  "school": {
    "title": "Koulu",
    "summary": "Lasten koulupäivä InfoMentorista tai SchoolSoftista Home Assistantin kautta: koulukortti, koulun kalenterit ja viikkokirje.",
    "blocks": [
      {
        "p": "Jos perhe on yhdistänyt Home Assistantin, lasten koulu voi tulla Smooth Familyyn yhteisön InfoMentor- ja SchoolSoft-integraatioiden kautta. Tänään-näkymän koulukortti näyttää kunkin lapsen koulupäivän, liikunnan seuraavana koulupäivänä, iltapäiväkerhon ajat, läksyt, poissaolot ja mitä seuraavaksi tapahtuu – ja viikkokirjeen, joka avautuu suoraan siinä. Koulun kalenterit – lukujärjestys, kokeet ja retket, iltapäiväkerho – tulevat kalenteriin lapsen kalentereina."
      },
      {
        "details": [
          {
            "title": "InfoMentor (suositeltu)",
            "blocks": [
              {
                "steps": [
                  "Avaa Home Assistantissa HACS → ⋮ → Mukautetut repositoriot, lisää https://github.com/c14ym0re/infomentor-homeassistant tyypillä Integraatio ja asenna InfoMentor.",
                  "Käynnistä Home Assistant uudelleen.",
                  "Asetukset → Laitteet ja palvelut → Lisää integraatio → InfoMentor. Kirjaudu BankID:llä (skannaa QR-koodi – toistaiseksi vain Tukholman kaupungille) tai sähköpostilla ja salasanalla, jos kunnallasi on yhä perinteinen InfoMentor-tili.",
                  "Jokaisesta lapsesta tulee laite. Valitse lapsi Smooth Familyssa kohdassa Perheenjäsenet → lapsi → Koulu Home Assistantista."
                ]
              },
              {
                "note": "Se antaa koulupäivän, liikunnan, läksyt, viikkokirjeen, poissaolot, iltapäiväkerhon ajat, koulun kalenterin ja koulun uutiset – ja lounaan, jos annat koulun Mateo-yksikön. Toinen integraatio, https://github.com/chrfo892/ha-infomentor, antaa lukujärjestyksen, iltapäiväkerhon sisäänkirjautumisen ja lukemattomat ilmoitukset; se asennetaan samalla tavalla."
              }
            ]
          },
          {
            "title": "SchoolSoft (lukujärjestys ja läsnäolo)",
            "blocks": [
              {
                "steps": [
                  "Lisää HACS → ⋮ → Mukautetut repositoriot -kohdassa https://github.com/chriseckl/Schoolsoft-for-Home-Assistant tyypillä Integraatio, asenna se ja käynnistä Home Assistant uudelleen.",
                  "Asetukset → Laitteet ja palvelut → Lisää integraatio → SchoolSoft, ja kirjaudu huoltajan käyttäjätunnuksella ja salasanalla.",
                  "Lisää se kerran lasta kohden ja valitse sitten kunkin lapsen tili Smooth Familyssa."
                ]
              },
              {
                "note": "Se antaa lukujärjestyksen kalenterina (tunnit merkitty poissaoloksi tai myöhästymiseksi), meneillään olevan ja seuraavan tunnin sekä päivän alun ja lopun. Ruokalistaa varten on https://github.com/kanylbullen/ha-schoolsoft – koulun nimi on sama kuin koulun SchoolSoft-osoitteessa."
              }
            ]
          }
        ]
      },
      {
        "p": "Uusi viikkokirje, tämän päivän poissaolo ja koulun uutiset lähetetään lapsen aikuisille ilmoituksina. Lapsen koulun näkevät lapsen aikuiset ja lapsi itse; keittiön näyttö näyttää vain koulupäivän, ei koskaan poissaoloja tai kirjeitä."
      },
      {
        "tips": [
          "Lisää Koulu-kortti Tänään-näkymään kohdasta Muokkaa – ja halutessanne Koulupäivä keittiön näytölle kohdassa Perheen asetukset → Keittiön näyttö.",
          "Beta: integraatiot ovat pieniä, epävirallisia projekteja, ja niiden anturit tunnistetaan nimistä (englanniksi tai ruotsiksi). Jos jotain puuttuu, kerro meille, mitä antureita integraatiossanne on.",
          "Koulun kalenterin voi lisätä myös käsin kalenteriasetuksissa osoitteella homeassistant://calendar.nimi.",
          "Home Assistantin kalenterit vaativat suoran yhteyden – niitä ei voi lukea yhdyskäytävän kautta."
        ]
      }
    ]
  },
  "health": {
    "title": "Terveys",
    "summary": "Liikuntasi sekä päivän askeleet, uni ja paino – yksityisesti tai perheen kanssa jaettuna.",
    "blocks": [
      {
        "p": "Kirjaa liikunta muutamalla napautuksella – laji, minuutit ja halutessasi matka – sekä päivän askeleet, uni ja paino. Sivusi näyttää viimeiset neljä viikkoa: minuutit päivässä, treenisi ja montako päivää putkeen olet liikkunut."
      },
      {
        "h": "Kuka sen näkee"
      },
      {
        "p": "Kaikki on vain sinun, kunnes jaat sen, tieto kerrallaan: liikunta, askeleet, uni ja paino, kukin vain sinulle, aikuisille tai koko perheelle. Muut näkevät jakamasi viikon yhteenvedossa ylhäällä."
      },
      {
        "steps": [
          "Avaa Terveys valikosta.",
          "Kirjaa liikunta tai päivän arvot.",
          "Kohdassa Kuka näkee terveytesi valitset, mitä jaat ja kenelle."
        ]
      },
      {
        "h": "Yhdessä"
      },
      {
        "p": "Aikuinen asettaa perheen tavoitteet – tunnit, kilometrit tai treenit kahden päivämäärän välillä, esimerkiksi 500 km yhdessä toukokuussa. Niihin lasketaan liikunta, jonka kukin jakaa perheen kanssa, ja ne näkyvät Terveys-osiossa, sunnuntaikatsauksessa ja keittiönäytöllä (viikon liikunta). Tehtävän voi tehdä liikkumalla: valitse vähintään niin monta minuuttia sinä päivänä, niin se kuittautuu itsestään, kun henkilön liikunta riittää – pisteineen kuten mikä tahansa tehtävä. Liikunnasta saa myös merkkejä."
      },
      {
        "tips": [
          "Aikuiset näkevät aina lapsen terveystiedot ja voivat täyttää niitä – vanhempi voi kirjata jalkapallotreenit.",
          "Lapsen painoa ei tallenneta, eikä painoa koskaan verrata: se ei näy yhteenvedossa.",
          "Lataa omat tietosi tiedostona tai poista kaikki sivusi alalaidasta."
        ]
      },
      {
        "h": "Home Assistantista"
      },
      {
        "p": "Jos perhe on yhdistänyt Home Assistantin, askeleet, uni, paino ja leposyke voidaan hakea kunkin omilta tileiltä: puhelin Companion-sovelluksella, Withings-käyttäjä, Google Health, Garmin ja muut. Perheen ylläpitäjä yhdistää tilit kohdassa Perheen asetukset → Perheenjäsenet → henkilö; henkilö ottaa sitten profiilissaan käyttöön Hae terveystietoni Home Assistantista – mitään ei haeta ennen sitä. Lapselle aikuinen ottaa sen käyttöön lapsen sivulla. Ne luetaan 15 minuutin välein ja kun painat Hae nyt, ja ne tallennetaan päivälle, jota ne koskevat; itse syöttämäsi arvo voittaa aina, eikä lapsen painoa koskaan lueta."
      },
      {
        "tips": [
          "Yksi tili per henkilö Home Assistantissa: lisää Withingsin, Garminin tai Google Healthin integraatio kerran kullekin omalla kirjautumisella – ja Companion-sovellus jokaiseen puhelimeen.",
          "Askeleet ja uni puhelimesta: asenna Home Assistantin Companion-sovellus ja ota sen anturit käyttöön – Androidissa Health Connect -anturit (askeleet, uni, syke, paino …), iPhonessa askelmittari (askeleet).",
          "Vaaka tai kello: Withingsillä on oma integraatio Home Assistantissa; Garmin, Fitbit, Oura ja muut löytyvät yhteisön integraatioina (HACS).",
          "Treenit (beta): Withingsin treenikalenterista tai integraation viimeisimpien aktiviteettien anturista, kuten Garmin Connect tai Strava – viimeiset kaksi viikkoa, jokainen treeni kerran, myös jos se on jo kirjattu tänne käsin."
        ]
      }
    ]
  },
  "twohomes": {
    "title": "Kaksi kotia",
    "summary": "Lapsille, jotka asuvat molempien vanhempien luona: aikataulu, vaihdot ja toinen vanhempi.",
    "blocks": [
      {
        "p": "Aseta, minä päivinä lapsi on missäkin kodissa – vuoroviikoin, 2-2-3, joka toinen viikonloppu tai omat päivät – ja lisää poikkeukset lomille ja vaihdetuille viikonlopuille. Kalenteri näyttää päivät, ja lapsen tehtävät odottavat, kun hän on toisessa kodissa."
      },
      {
        "shot": "twohomes",
        "caption": "Aikataulu kotien välillä."
      },
      {
        "steps": [
          "Avaa Perheen asetukset → Perheenjäsenet → lapsi.",
          "Valitse lapsi, malli ja ensimmäinen päivä.",
          "Lisää poikkeuksia, kun suunnitelmat muuttuvat."
        ]
      },
      {
        "h": "Toinen vanhempi"
      },
      {
        "p": "Toinen vanhempi voi saada oman tilin, joka näkee vain oman lapsensa: aikataulun, kalenterin, hätäkortin ja vaihtolistan – ja voi kirjoittaa teidän kanssanne. Tai lähetä linkki, joka näyttää saman ilman tiliä. Lapsen tavaroiden kulut voi jakaa, jolloin toinen näkee summan ja osuutensa – ei koskaan kuvia tai muistiinpanoja."
      },
      {
        "tips": [
          "Vaihtoa edeltävänä iltana aikuisia muistutetaan vaihtolistan kera.",
          "Kaksi kotia -välilehti näkyy kalenterissa, kun aikataulu on asetettu."
        ]
      }
    ]
  },
  "week": {
    "title": "Sunnuntaikatsaus",
    "summary": "Rauhallinen hetki joka viikko: katse taaksepäin, eteenpäin ja kiitos.",
    "blocks": [
      {
        "p": "Sunnuntaikatsaus kokoaa perheen kerran viikossa. Katsokaa taaksepäin pisteisiin ja viikon parhaaseen auttajaan, eteenpäin kalenteriin, ruokiin ja siihen, kenen vuoro on – ja antakaa toisillenne kiitostähtiä."
      },
      {
        "shot": "week",
        "caption": "Mennyt viikko ja tuleva viikko."
      },
      {
        "p": "Valitkaa jotain yhteistä tekemistä ja merkitkää katsaus tehdyksi: kaikki saavat lyhyen yhteenvedon. Sunnuntai-iltapäivänä teitä muistutetaan, jos ette ole tehneet sitä."
      },
      {
        "h": "Tulevan viikon suunnittelu"
      },
      {
        "p": "Tulevan viikon kohdalla napauta tapahtuman vieressä Kyydit ja pakkaus ottaaksesi viennin tai haun ja antaaksesi sille pakkauslistan. Kirjoita päivän päivällinen suoraan – reseptin nimi tuo sen ainekset ostoslistaan – tai suunnittele koko viikon ruoat sieltä."
      }
    ]
  },
  "chat": {
    "title": "Chat",
    "summary": "Perheen oma chat – kuvineen ja vain teille.",
    "blocks": [
      {
        "p": "Kirjoita koko perheen tai yhden tai muutaman kanssa. Kuvat päätyvät chatin omaan albumiin holvissa. Viestit säilytetään palvelimellanne – kukaan muu ei lue niitä."
      },
      {
        "shot": "chat",
        "caption": "Viestit ryhmiteltynä henkilöittäin, isoin emojein."
      },
      {
        "tips": [
          "GIFit voi ottaa käyttöön palvelimen ylläpitäjä; ne tulevat GIPHYstä, ainoa kerta, kun chat ulottuu ulkopuolelle.",
          "Lukemattomat viestit näkyvät numerona chatissa ja korttina Tänään-sivulla."
        ]
      }
    ]
  },
  "lists": {
    "title": "Listat",
    "summary": "Ostos- ja tehtävälistat, jotka päivittyvät kaikille heti.",
    "blocks": [
      {
        "p": "Tehkää niin monta listaa kuin tarvitsette – ruoka, rautakauppa, pakkaaminen. Kaikki näkevät kuittaukset ja uudet asiat heti, ja listat toimivat ilman kenttää. Nimeä lista uudelleen nimen vieressä olevalla kynällä."
      },
      {
        "shot": "lists",
        "caption": "Ostoslista, jaettu ja elävä."
      },
      {
        "tips": [
          "Ostetut tuotteet voi siirtää suoraan ruokakomeroon kohdasta Siirrä ostetut varastoon.",
          "Listan voi lähettää Home Assistantiin ja sieltä kaupan sovellukseen – katso Ostoslistat Home Assistantissa.",
          "Toivelistat ja lahjojen suunnittelu ovat myös listoja – katso Toivelistat ja lahjat."
        ]
      }
    ]
  },
  "wishes": {
    "title": "Toivelistat ja lahjat",
    "summary": "Kaikkien toivelistat, salainen lahjasuunnittelu ja linkki isovanhemmille.",
    "blocks": [
      {
        "p": "Jokaisella perheessä on toivelista. Lisää toive linkin ja hinnan kera – tai hae se verkosta. Muut suunnittelevat lahjat salaa: päivänsankari ei koskaan näe, kuka ostaa mitä."
      },
      {
        "shot": "wishes",
        "caption": "Toivelista linkkeineen."
      },
      {
        "h": "Jaa sukulaisille"
      },
      {
        "p": "Lähetä linkki isovanhemmille ja muille, joilla ei ole tiliä. He näkevät toivelistan ja voivat merkitä, mitä ostavat, jottei mitään osteta kahdesti – ilman että lapsi näkee sitä."
      },
      {
        "tips": [
          "Kuusi viikkoa ennen syntymäpäivää päivänsankaria muistutetaan täyttämään listansa, ja kuukautta ennen muita muistutetaan suunnittelemaan.",
          "Syntymäpäivät: jäsenen omalla sivulla kohdassa Perheenjäsenet; sukulaiset ja ystävät kohdassa Perheenjäsenet → Muut ihmiset."
        ]
      }
    ]
  },
  "food": {
    "title": "Ruoka ja ruokalista",
    "summary": "Viikon päivälliset, reseptit linkistä ja ruoanlaittotila.",
    "blocks": [
      {
        "p": "Suunnittele viikon päivälliset Ruoka-sivulla. Hae resepti linkistä – useimmat reseptisivut toimivat – tai liitä teksti, jos sivua ei voi lukea. Ainekset voi lisätä suoraan ostoslistalle."
      },
      {
        "shot": "food",
        "caption": "Viikon päivälliset."
      },
      {
        "h": "Ruoanlaittotila"
      },
      {
        "p": "Napauta reseptissä Kokkaa, niin saat ison tekstin, kuitattavat ainekset ja napautellen etenevät vaiheet. Pidä näyttö päällä estää puhelinta pimenemästä, kun kädet ovat sotkuiset."
      },
      {
        "h": "Eväslaatikot ja viikonlopun lounas"
      },
      {
        "p": "Kun suunnittelet viikkoa, valitse Eväslaatikot arkipäivinä ja montako päivässä: edellisillan päivällinen tehdään silloin isona satsina – pata, keitto tai laatikko, joka säilyy ja lämpenee hyvin – ja tähteet täyttävät seuraavan päivän eväslaatikot. Valitse Lounas lauantaina ja sunnuntaina, niin viikonlopun lounaatkin suunnitellaan. Valinta muistetaan ensi viikkoon."
      },
      {
        "tips": [
          "Paikallinen tekoäly voi ehdottaa viikon päivälliset – sen mukaan, mistä pidätte ja mitä teillä on kotona.",
          "Kun päivällinen on valmis, kuittaa mitä kului, niin ruokakomero laskee itse alas."
        ]
      }
    ]
  },
  "recipebook": {
    "title": "Reseptikirja",
    "summary": "Perheen reseptit luokkineen, suosikkeineen ja kaikkien tähtineen.",
    "blocks": [
      {
        "p": "Reseptikirja säilyttää perheen reseptit luokkineen, suosikkeineen ja linkkeineen alkuperäiseen. Jokainen perheessä antaa omat tähtensä – lapsetkin – joten näette, mikä on suosittua."
      },
      {
        "shot": "recipebook",
        "caption": "Reseptit kaikkien tähtineen."
      },
      {
        "p": "Voi tehdä nyt näyttää, mitä ruokakomeron tarvikkeista voi valmistaa. Hae uusia reseptejä verkosta palvelimen omalla hakukoneella – vain hakusanat lähtevät palvelimelta."
      }
    ]
  },
  "pantry": {
    "title": "Ruokakomero",
    "summary": "Mitä teillä on pakastimessa, jääkaapissa ja komerossa – ja mitä pitää syödä pian.",
    "blocks": [
      {
        "p": "Pidä kirjaa siitä, mitä teillä on, missä ja mihin asti. Pian vanhenevat merkitään ja näkyvät Tänään-sivulla, joten ruokaa heitetään vähemmän pois."
      },
      {
        "shot": "pantry",
        "caption": "Parasta ennen, paikoittain."
      },
      {
        "h": "Skannaa ostokset sisään"
      },
      {
        "steps": [
          "Napauta Skannaa ostokset ja näytä tuotteet kameralle yksi kerrallaan – sama tuote uudelleen kasvattaa määrää.",
          "Tarkista nimet ja määrät.",
          "Laita kaikki oikeaan paikkaan kerralla."
        ]
      },
      {
        "tips": [
          "Viivakoodien haun voi ottaa käyttöön kohdassa Perheen asetukset → Yhteydet; vain viivakoodi lähetetään.",
          "Paikallisen tekoälyn lukema kuitti voi myös täyttää ruokakomeron."
        ]
      }
    ]
  },
  "tasks": {
    "title": "Tehtävät ja pisteet",
    "summary": "Kotityöt pisteineen, vuorottelu, hyväksyntä – ja jälki-ilmoitus.",
    "blocks": [
      {
        "p": "Tehtävä voi olla kertaluonteinen tai toistua päivittäin, valittuina viikonpäivinä, kuukausittain tai vuosittain. Jokainen on pisteiden arvoinen. Napauta Tehty, kun se on tehty – lasten tehtävät voivat odottaa aikuisen hyväksyntää."
      },
      {
        "shot": "tasks",
        "caption": "Päivän tehtävät pisteineen."
      },
      {
        "h": "Vuorottelu"
      },
      {
        "p": "Valitse, ketkä vuorottelevat tehtävässä: vuoro siirtyy, kun se on tehty, tai joka viikko. Lista näyttää, kuka on seuraavana vuorossa."
      },
      {
        "h": "Unohtuiko kuitata?"
      },
      {
        "p": "Kohdassa Tehtävät → Tänään siirry nuolella taaksepäin – enintään kolme päivää – ja kuittaa tehty, pisteet tavalliseen tapaan."
      },
      {
        "h": "Merkitsitkö väärän?"
      },
      {
        "p": "Peru tehty tehtävä napauttamalla sen merkkiä – pisteet otetaan takaisin. Lapsi voi perua omansa, kunnes aikuinen on hyväksynyt ne; aikuinen voi perua kaikki. Keittiönäytöllä napauta tehtyä tehtävää ja vahvista."
      },
      {
        "h": "Tehtävät muista sovelluksista"
      },
      {
        "p": "Lapsen ja lemmikin lääkeannoksista tulee tehtäviä pisteineen, ja niin tulee myös pakkaamisesta ennen matkaa tai tapahtumaa. Aikuinen voi kuitata lapsen annoksen; pisteet menevät silti lapselle."
      },
      {
        "tips": [
          "Tehtävä voi toistua joka arkipäivä (maanantai–perjantai, jotka eivät ole pyhäpäiviä) tai joka viikonloppu- ja pyhäpäivä – koiran ulkoilutus, kissan ruokinta. Pyhäpäivät seuraavat perheen maata, joten joulu, pääsiäinen ja juhannusaatto lasketaan viikonlopuksi itsestään.",
          "Mikä tahansa aikataulu: joka päivä tai joka toinen päivä, valitut viikonpäivät (arkipäivät, viikonloppu), muutaman viikon välein, kuukauden päivämäärä tai viikonpäivä (ensimmäinen lauantai), muutaman kuukauden välein, kerran vuodessa – pisteineen. Lemmikeillä, kodilla ja ajoneuvoilla on toistuvat tehtävänsä samoin valinnoin.",
          "Lapset voivat ehdottaa tehtäviä; aikuinen tekee niistä tehtäviä tai kieltäytyy.",
          "Pisteet menevät kauppaan ja viikkorahaan – katso niiden aiheet.",
          "Tehtävä, jonka useampi voi tehdä yhdessä, jakaa pisteensä tekijöiden kesken: valitse ketkä, kun se kuitataan.",
          "Kun poistat tehtävän, jo ansaitut pisteet – ja kerrat, jolloin se tehtiin – säilyvät."
        ]
      }
    ]
  },
  "allowance": {
    "title": "Viikkoraha ja säästäminen",
    "summary": "Viikkorahaa pisteistä tai tavoitteesta, ja säästöpossut.",
    "blocks": [
      {
        "p": "Jokainen lapsi ansaitsee viikkorahaa joko pisteistä tai saavuttamalla viikkotavoitteen – perhe valitsee lapsittain. Maksut kirjataan, joten kaikki näkevät, mitä on maksettu."
      },
      {
        "shot": "allowance",
        "caption": "Viikkoraha ja säästöpossut."
      },
      {
        "p": "Säästöpossut jakavat rahat: kuluttaminen, säästäminen, antaminen tai oma tavoite. Lapsi voi ehdottaa säästötavoitetta osalla viikkorahastaan; aikuinen hyväksyy sen."
      }
    ]
  },
  "shop": {
    "title": "Palkintokauppa ja saavutukset",
    "summary": "Vaihda pisteet palkintoihin ja avaa saavutuksia.",
    "blocks": [
      {
        "p": "Kaupassa lapset vaihtavat pisteensä aikuisten lisäämiin palkintoihin – tunti pelaamista, perjantain päivällisen valinta. Ostos voi odottaa aikuisen hyväksyntää. Perhetavoitteet ovat palkintoja, joita koko perhe säästää yhdessä."
      },
      {
        "shot": "shop",
        "caption": "Palkinnot kaupassa."
      },
      {
        "p": "Saavutukset avautuvat itsestään – ensimmäinen tehtävä, viikko putkeen – ja taso kasvaa pisteiden mukana."
      }
    ]
  },
  "littleones": {
    "title": "Pikkutila",
    "summary": "Isoja kuvia tekstin sijaan lapsille, jotka eivät vielä osaa lukea.",
    "blocks": [
      {
        "p": "Pikkutilassa lapsi näkee sovelluksen sijaan isoja kuvakortteja: aamu- ja iltarutiinit järjestyksessä, eskarireppu – napauta, kun se on tehty, niin kuulet pienen fanfaarin ja saat tarran."
      },
      {
        "shot": "littleones",
        "caption": "Rutiinit pienimmille."
      },
      {
        "steps": [
          "Avaa Tehtävät → Pikkutila.",
          "Ota tila käyttöön lapselle – 6-vuotias tai nuorempi lapsi, jonka syntymäpäivä annettiin, aloittaa se päällä.",
          "Aloita valmiista rutiinista tai tee oma kuvien kanssa."
        ]
      },
      {
        "tips": [
          "Aikuinen pääsee tilasta pitämällä lukkoa painettuna ja vastaamalla laskutehtävään.",
          "Keittiön näytöllä jokainen lapsi voi avata rutiininsa napauttamalla omia kasvojaan."
        ]
      }
    ]
  },
  "vault": {
    "title": "Holvi",
    "summary": "Kuvat, tiedostot, asiakirjat, kuitit ja salasanat yhdessä paikassa.",
    "blocks": [
      {
        "p": "Holvi säilyttää perheen kuvat, chat-kuvat, tiedostot, asiakirjat ja kuitit – kaikki salattuna palvelimellanne. Suodata lajeittain, hae ja merkitse jotain Vain minä, jottei kukaan muu näe sitä."
      },
      {
        "shot": "vault",
        "caption": "Kaikki holvissa, suodatin lajeittain."
      },
      {
        "h": "Jaa linkillä"
      },
      {
        "p": "Kaiken holvissa voi jakaa linkillä, joka lakkaa toimimasta itsestään – tuntien tai päivien jälkeen tai kun se on avattu kerran. Valitse, saako vastaanottaja ladata. Word-, Excel- ja PowerPoint-tiedostot näytetään suoraan selaimessa."
      },
      {
        "tips": [
          "Samana päivänä aiempina vuosina otetut kuvat näkyvät Muistoina Tänään-sivulla.",
          "Palvelimen ylläpitäjä päättää, kuinka suuri tiedosto saa olla."
        ]
      }
    ]
  },
  "documents": {
    "title": "Asiakirjat",
    "summary": "Passit, henkilökortit, vakuutukset ja sopimukset – muistutuksin ennen vanhenemista.",
    "blocks": [
      {
        "p": "Säilytä perheen asiakirjat skannattuina: passit, henkilökortit, ajokortit, vakuutukset, takuut, sopimukset ja rokotukset. Numerot näytetään peitettyinä ja kaikki salataan perheen omalla avaimella."
      },
      {
        "shot": "documents",
        "caption": "Asiakirjat viimeisine voimassaolopäivineen."
      },
      {
        "p": "Voimassaolon päättymisestä tulee muistutus ajoissa ja se näkyy kalenterissa, joten passi uusitaan ennen lomaa."
      }
    ]
  },
  "passwords": {
    "title": "Salasanat",
    "summary": "Perheen yhteiset kirjautumistiedot, salattuina perheen avaimella.",
    "blocks": [
      {
        "p": "Säilytä kirjautumistiedot holvin Salasanat-näkymässä: suoratoistopalvelu, wifi, koulun alusta. Ne salataan perheen avaimella. Aikuinen valitsee, kenelle aikuiselle kirjautumistieto jaetaan; lapset näkevät omansa ja aikuiset lasten."
      },
      {
        "shot": "passwords",
        "caption": "Kirjautumistiedot luodulla salasanalla."
      },
      {
        "tips": [
          "Luo vahva salasana yhdellä napautuksella.",
          "Linkillä jaettu kirjautumistieto näytetään kerran – sitten linkki lakkaa toimimasta."
        ]
      }
    ]
  },
  "receipts": {
    "title": "Kuitit",
    "summary": "Paikallisen tekoälyn lukemat kuitit muistutuksin palautuksesta ja takuusta.",
    "blocks": [
      {
        "p": "Ota kuva kuitista tai valitse kuvakaappaus ja liitä se asuntoon, ajoneuvoon tai luokkaan. Paikallinen tekoäly lukee kaupan, summan ja päivän puolestasi. Viimeinen palautuspäivä ja takuun päättyminen muistutetaan, ja reklamaatioaika näkyy itsestään."
      },
      {
        "shot": "receipts",
        "caption": "Kuitit palautuksineen ja takuineen."
      },
      {
        "tips": [
          "Hae kuiteista, katso Vuosi lukuina ja vie ne Exceliin.",
          "Lapsen tavaroiden kuitin voi jakaa toiseen kotiin.",
          "Paikallinen tekoäly voi kirjoittaa reklamaatiokirjeen puolestasi.",
          "Androidissa jaat kuitin toisesta sovelluksesta suoraan Smooth Familyyn."
        ]
      }
    ]
  },
  "safety": {
    "title": "Hätäkortit ja lääkkeet",
    "summary": "Mitä lapsenvahdin pitää tietää, ja lääkkeet muistutuksineen.",
    "blocks": [
      {
        "p": "Hätäkorteissa on tärkein, jos jotain sattuu: allergiat, lääkkeet, terveyskeskus, kenelle soitetaan ja rutiinit – yksi kullekin henkilölle ja yksi kodille. Niitä voi lukea ilman yhteyttäkin."
      },
      {
        "shot": "safety",
        "caption": "Hätäkortit. Jäsenen korttia ja lääkkeitä hoidetaan hänen sivullaan kohdassa Perheen asetukset → Perheenjäsenet; kotitalouden korttia kohdassa Arki."
      },
      {
        "h": "Lapsenvahti tai isovanhemmat"
      },
      {
        "p": "Tee vieraslinkki kohdassa Perheen asetukset → Perheenjäsenet: se näyttää hätäkortit sekä valitsemasi osat kalenterista ja listoista muutaman tunnin tai päivän ajan – sitten se lakkaa itsestään."
      },
      {
        "h": "Lääkkeet"
      },
      {
        "p": "Lisää lääke annoksineen, aikoineen ja kuurin päättymispäivineen. Lapsen ja lemmikin annoksista tulee tehtäviä pisteineen; aikuisille ilmoitetaan, jos annosta ei kuitata. Aikuisen omat lääkkeet ovat yksityisiä – ne lisätään kohdassa Oma profiili eivätkä ne anna pisteitä."
      }
    ]
  },
  "property": {
    "title": "Koti",
    "summary": "Huolto, tavarat huoneittain, energia ja projektit – asunnoittain.",
    "blocks": [
      {
        "p": "Jokaisella asunnolla – talolla, asunnolla, mökillä – on oma korttinsa, jossa on tulevat huollot, tämän vuoden kulut viime vuoteen verrattuna, energia ja käynnissä olevat projektit budjetteineen ja toteumineen."
      },
      {
        "shot": "property",
        "caption": "Kortti asuntoa kohden."
      },
      {
        "p": "Toistuvaa huoltoa – rännit, suodattimet, palovaroitin – ehdotetaan asunnon tyypin mukaan, siitä muistutetaan etukäteen ja se näkyy kalenterissa; siitä voi tehdä myös tehtävän. Tavarat huoneittain – kodinkoneet, lämpöpumppu – säilyttävät merkin, hinnan, käyttöohjeen ja takuun."
      },
      {
        "tips": [
          "Sähkön, veden ja lämmön voi lukea Home Assistantin antureista (vain luku).",
          "Tulosta luettelo tavaroista ja kuiteista kotivakuutusta varten."
        ]
      }
    ]
  },
  "economy": {
    "title": "Talous",
    "summary": "Mihin kotitalouden rahat menevät – tuloineen, budjetteineen ja pankin tiedostoineen.",
    "blocks": [
      {
        "p": "Talous näyttää kotitalouden menot luokittain – ruoka, asunnot, auto, lapset, vapaa-aika. Kuitit sekä asuntojen, ajoneuvojen ja matkojen kulut lasketaan mukaan itsestään. Jokainen aikuinen lisää omat tulonsa, ja yhteenveto näyttää, mitä tulee, menee ja jää."
      },
      {
        "shot": "economy",
        "caption": "Kuukausi luokittain."
      },
      {
        "h": "Tuo pankista"
      },
      {
        "steps": [
          "Vie tilin tapahtumat CSV-tiedostona verkkopankista.",
          "Lataa tiedosto kohdassa Talous → Tuo pankista.",
          "Tarkista ehdotus kullekin riville – polttoaine autolle, sähkölasku asunnolle – ja tallenna."
        ]
      },
      {
        "tips": [
          "Budjetti luokittain ja kuukausittain muuttuu punaiseksi, kun se ylittyy.",
          "Merkinnät voivat olla yksityisiä, jolloin vain sinä näet ne."
        ]
      }
    ]
  },
  "vehicles": {
    "title": "Ajoneuvot",
    "summary": "Katsastus, huolto, renkaat, kulut ja kulutus – kaikelle, missä on moottori tai pyörät.",
    "blocks": [
      {
        "p": "Jokaisella ajoneuvolla on kortti, jossa on tulevat asiat – katsastus, huolto, renkaanvaihto, vakuutus ja vero – ja tämän vuoden kulut. Muistutukset tulevat päivämäärän tai mittarilukeman mukaan, ja seuraava asetetaan, kun merkitset edellisen tehdyksi."
      },
      {
        "shot": "vehicles",
        "caption": "Ajoneuvo ja sen tulevat asiat."
      },
      {
        "p": "Lisää tankkaus tai lataus litroina tai kilowattitunteina, niin kulutus lasketaan; kotilataus käyttää päivän sähkön hintaa. Säilytä rengassarjat kausineen ja urasyvyyksineen, ja tee ostajalle raportti huoltohistoriasta."
      },
      {
        "tips": [
          "Kuva kuitista tai huoltohistoria PDF:nä luetaan paikallisella tekoälyllä.",
          "Mittarilukeman voi lukea Home Assistantin anturista."
        ]
      }
    ]
  },
  "pets": {
    "title": "Lemmikit",
    "summary": "Eläinlääkärikäynnit, rokotukset, kotityöt ja syntymäpäivä.",
    "blocks": [
      {
        "p": "Jokaisella eläimellä on eläinlääkärikäyntinsä ja rokotuksensa, joista muistutetaan ajallaan, ja syntymäpäivä syntymäpäivien joukossa. Kotityöt kuten lenkit ja ruokinta ovat tehtäviä, joissa lapset vuorottelevat – ja lääkeannokset noudattavat samaa vuoroa."
      },
      {
        "shot": "pets",
        "caption": "Lemmikki hoitoineen."
      },
      {
        "tips": [
          "Tehtävä voi toistua joka arkipäivä (maanantai–perjantai, jotka eivät ole pyhäpäiviä) tai joka viikonloppu- ja pyhäpäivä – koiran ulkoilutus, kissan ruokinta. Pyhäpäivät seuraavat perheen maata, joten joulu, pääsiäinen ja juhannusaatto lasketaan viikonlopuksi itsestään."
        ]
      }
    ]
  },
  "smarthome": {
    "title": "Älykoti",
    "summary": "Valot, lämpö ja kaiuttimet, työnkulut, kuka on kotona ja sähkön hinta.",
    "blocks": [
      {
        "p": "Kun Home Assistant on yhdistetty, ohjaat kodin laitteita Smooth Familysta – valoja, sälekaihtimia, lämpöpumppua, robotti-imuria, kaiuttimia – huoneittain ja asunnoittain. Perheen ylläpitäjä valitsee, mitkä laitteet näkyvät."
      },
      {
        "shot": "smarthome",
        "caption": "Laitteet huoneittain."
      },
      {
        "h": "Työnkulut"
      },
      {
        "p": "Rakenna omat automaatiosi muodossa Kun → Jos → Tee: tiettyyn aikaan, Tänään-sivun painikkeella, kun laite muuttuu tai kun joku tulee kotiin – esimerkiksi sytytä portaiden valo, kun tulee pimeää. Työnkulut voivat toimia itse Home Assistantissa, joten ne toimivat Smooth Familyn käynnistyessä uudelleen."
      },
      {
        "h": "Kuka on kotona"
      },
      {
        "p": "Liitä perhe Home Assistantin henkilöihin, niin jokainen valitsee näyttääkö kotona vai poissa – ei koskaan, missä olet. Mitään ei tallenneta."
      },
      {
        "tips": [
          "Sähkön hinta: kortti Tänään-sivulla päivän tunneista ja työnkulut, jotka toimivat halvimpina tunteina.",
          "Ei Home Assistantia? Kokeile kaikkea simuloidulla kodilla."
        ]
      }
    ]
  },
  "homeassistant": {
    "title": "Home Assistantin yhdistäminen",
    "summary": "Kodin Home Assistant suoraan – ja muut kodit yhdyskäytävän kautta.",
    "blocks": [
      {
        "p": "Home Assistant, joka on samassa kodissa kuin Smooth Family -palvelin, yhdistetään suoraan osoitteella ja pitkäaikaisella tunnuksella. Toinen koti – mökki – yhdistetään sen sijaan yhdyskäytävän kautta, avaamatta siellä porttia."
      },
      {
        "steps": [
          "Home Assistantissa: profiilisi → Turvallisuus → Pitkäaikaiset käyttötunnukset → Luo tunnus. Kopioi se.",
          "Smooth Familyssa: Perheen asetukset → Yhteydet → Älykoti.",
          "Kirjoita osoite, esim. http://homeassistant.local:8123, ja tunnus ja napauta Yhdistä.",
          "Lisää näytettävät laitteet ja liitä koti oikeaan asuntoon."
        ]
      },
      {
        "shot": "homeassistant",
        "caption": "Kodit ja laitteet kohdassa Perheen asetukset."
      },
      {
        "p": "Tunnus tallennetaan salattuna palvelimelle. Smooth Family lukee tiloja ja ohjaa lisäämiäsi laitteita; energian ja mittarilukeman mittareita ja antureita vain luetaan."
      },
      {
        "tips": [
          "Käytä osoitetta, joka toimii palvelimelta – IP-osoite on varmin.",
          "Toisen palvelimella olevat perheet yhdistävät aina yhdyskäytävän kautta."
        ]
      }
    ]
  },
  "gateway": {
    "title": "Yhdyskäytävä – Home Assistant toisessa kodissa",
    "summary": "Mökin Home Assistant avaamatta porttia: lisäosana tai konttina.",
    "blocks": [
      {
        "p": "Yhdyskäytävä toimii toisen kodin Home Assistantin vieressä ja ottaa yhteyden Smooth Family -palvelimeenne HTTPS:n yli pitäen linjan auki. Sinne ei avata porttia, ja se toimii 4G-reitittimien takana. Home Assistantin tunnus pysyy siinä kodissa; palvelin voi pyytää vain tiloja ja kutsuja sallituissa toimialueissa – lukot ja hälyttimet vain, jos lisäät ne."
      },
      {
        "h": "1. Tee parikoodi"
      },
      {
        "p": "Perheen asetukset → Yhteydet → Älykoti → Lisää koti lisäosan kautta. Anna sille nimi ja valitse asunto; kahdeksanmerkkinen koodi on voimassa 24 tuntia."
      },
      {
        "shot": "gateway",
        "caption": "Koti yhdyskäytävän kautta versioineen."
      },
      {
        "h": "2. Asenna – tapa riippuu Home Assistantista"
      },
      {
        "p": "Home Assistantin Asetukset → Tietoja näyttää asennustyypin."
      },
      {
        "details": [
          {
            "title": "Home Assistant OS tai Supervised: lisäosana",
            "blocks": [
              {
                "steps": [
                  "Asetukset → Lisäosat → Lisäosakauppa → ⋮ → Repositoriot, ja lisää https://github.com/burnwalled/smoothfamily.",
                  "Smooth Family näkyy kaupassa: asenna se.",
                  "Syötä palvelimen osoite ja parituskoodi sen asetuksiin ja käynnistä se."
                ]
              },
              {
                "p": "Lisäosa käyttää Home Assistantin omaa tunnusta – pitkäaikaista tunnusta ei tarvita."
              }
            ]
          },
          {
            "title": "Home Assistant Container tai Core: omana konttinaan",
            "blocks": [
              {
                "p": "Näissä asennuksissa ei ole lisäosia, joten yhdyskäytävä toimii Docker-konttina Home Assistantin vieressä tai Raspberry Pi:llä siinä kodissa. Se tarvitsee pitkäaikaisen tunnuksen Home Assistant -profiilistasi."
              },
              {
                "steps": [
                  "Hae gateway-kansio osoitteesta https://github.com/burnwalled/smoothfamily ja rakenna sen image: docker build -t smooth-family-gateway gateway/",
                  "Käynnistä se muuttujilla SF_SERVER (palvelimen osoite), SF_PAIRING_CODE, HA_URL ja HA_TOKEN sekä taltiolla /data.",
                  "Sen lokissa lukee Paired as … ja sitten Connected to …."
                ]
              }
            ]
          }
        ]
      },
      {
        "h": "3. Päivitykset"
      },
      {
        "p": "Yhdyskäytävä päivittyy itse palvelimeltanne – oletuksena päällä. Se ajaa vain versioita, jotka on allekirjoitettu tietokoneella, jolla julkaisut tehdään; edes palvelimen haltuunsa ottanut ei voisi ajaa mökillä mitään. Jos uusi versio ei saa yhteyttä, edellinen palaa itsestään. Koti näyttää Uusin versio, kun se on ajan tasalla."
      },
      {
        "tips": [
          "Vaihdatko yhdyskäytävän tietokoneen, tai onko avain voinut vuotaa? Tee uusi koodi – vanha avain lakkaa toimimasta heti.",
          "Jos linja on poikki, komento epäonnistuu heti sen sijaan, että se ajettaisiin myöhässä."
        ]
      }
    ]
  },
  "halists": {
    "title": "Ostoslistat Home Assistantissa",
    "summary": "Lähetä lista Home Assistantiin – ja sieltä kaupan sovellukseen.",
    "blocks": [
      {
        "p": "Listan voi lähettää johonkin Home Assistantin tehtävälistaan tai liittää siihen, jolloin molemmat pysyvät samoina. Kun kaupan integraatio on asennettu Home Assistantiin, lista näkyy kaupan omassa sovelluksessa. Siellä ostetut kuitataan täällä ja näkyvät ruokakomeron kohdassa Juuri ostettu."
      },
      {
        "steps": [
          "Asenna kaupan integraatio Home Assistantiin (linkit ikkunassa – muiden tekemiä, omalla vastuulla).",
          "Avaa lista Smooth Familyssa → Home Assistant.",
          "Valitse tehtävälista ja lähetä kerran tai liitä listat."
        ]
      },
      {
        "note": "Uusi eikä vielä täysin testattu kauppojen kanssa: toimii niin hyvin kuin kaupan integraatio synkronoi kuittaukset takaisin."
      }
    ]
  },
  "kiosk": {
    "title": "Keittiön näyttö",
    "summary": "Tabletti seinällä perheen päivän kanssa.",
    "blocks": [
      {
        "p": "Yhdistä tabletti omalla linkillä tai QR-koodilla. Se näyttää perheen päivän: tämän ja huomisen kalenterin ja kuka kuljettaa, kuka on kotona, sään, tehtävät, päivällisen ja kouluruoan, jätehuollon ja sähkön hinnan – sekä painikkeen hätäkortille. Mitään yksityistä ei näytetä, eikä näytöllä ole tiliä."
      },
      {
        "shot": "kiosk",
        "caption": "Keittiön näyttö."
      },
      {
        "h": "Näytöllä"
      },
      {
        "p": "Tehtävät kuitataan suoraan siellä, isoilla sormelle sopivilla riveillä: napauta tehtävää ja sitten omia kasvojasi – yhdessä tehdyssä tehtävässä kaikkia auttajia, ja pisteet jaetaan. Viikon ruoat ja reseptikirja avaavat ruoanlaittotilan: resepti isolla, ainekset kuitattaviksi ja vaiheet yksi kerrallaan. Näytölle valittuja älylaitteita ohjataan napautuksella."
      },
      {
        "h": "Näytönsäästäjä"
      },
      {
        "p": "Valitsemiesi minuuttien jälkeen tulee näytönsäästäjä: perheen kuvat, läppäkello, rauhallinen kello ja sää, pimeä näyttö – tai kettu, joka näyttää ulkona olevan sään. Se lukee harmaina päivinä, lennättää leijaa pilvien ohittaessa, pitää sateenvarjoa sateessa, rakentaa lumiukon lumisateessa ja nukkuu yöllä, ja päivän avoimet tehtävät näkyvät järven yllä. Napautus herättää näytön."
      },
      {
        "p": "Muutaman minuutin välein kettu tekee jotain pientä säähän sopivaa – hyppää, loiskii lätäkössä, heittää lumipallon, katsoo tähdenlentoa – ja joskus jänis loikkii ohi tai kala hyppää järvessä. Se pukeutuu halloweeniksi, jouluksi, uudeksivuodeksi, pääsiäiseksi ja juhannukseksi, ja syntymäpäivänä (Syntymäpäivät-kohdan henkilöt) se saa ilmapalloja, juhlahatun ja banderollin nimellä. Juhlapyhät seuraavat perheen maata; asun voi kytkeä pois näyttökohtaisesti näytönsäästäjän alta. Kun tabletissa on vähennetty liike, kettu pysyy paikallaan."
      },
      {
        "steps": [
          "Perheen asetukset → Keittiön näyttö → Yhdistä näyttö.",
          "Avaa linkki tabletilla (tai skannaa QR-koodi) ja lisää se aloitusnäytölle.",
          "Valitse näytön kohdalta, mitä se näyttää, näytönsäästäjä, värit, kieli ja yö."
        ]
      },
      {
        "tips": [
          "Kaikki näytön asetukset ovat kohdassa Perheen asetukset → Keittiön näyttö: nimi, näytönsäästäjä (kuva jokaisesta), mitä se näyttää, värit ja kieli, milloin se himmenee yöllä, mitä älylaitteita se saa ohjata ja mitä se saa tehdä. Yksi painike antaa kaikille näytöille samat asetukset, ja näyttö hakee muutoksen minuutin kuluessa.",
          "Viikon ruoat ja reseptikirja valitaan näyttökohtaisesti – ne ovat pois päältä, kunnes otat ne käyttöön.",
          "Lukkoa ei koskaan näytetä näytöllä, mitä tahansa valitset.",
          "Kadonnut linkki korvataan Uusi linkki -painikkeella; Katkaise yhteys sulkee linkin kokonaan.",
          "Pienet voivat avata kuvarutiininsa siellä napauttamalla omia kasvojaan.",
          "Koko näyttö kulman painikkeesta (iPadilla lisää näyttö sen sijaan aloitusnäytölle)."
        ]
      }
    ]
  },
  "localai": {
    "title": "Paikallinen tekoäly",
    "summary": "Tekoäly kotisi tietokoneella – kuitteihin, resepteihin ja ehdotuksiin.",
    "blocks": [
      {
        "p": "Smooth Family voi käyttää tekoälyä, joka toimii kotinne tietokoneella Ollaman avulla. Se lukee kuitteja ja huoltohistorioita, muuttaa tekstin tai kuvan reseptiksi, ehdottaa viikon päivällisiä ja kotitöitä ja vastaa kysymyksiin verkkohaun avulla. Mitään ei lähetetä ulkoiseen palveluun."
      },
      {
        "shot": "localai",
        "caption": "Paikallisen tekoälyn työt."
      },
      {
        "p": "Palvelimen ylläpitäjä määrittää sen kerran (Palvelimen asetukset → Tekoälykone) – se tarvitsee tietokoneen, jossa on kohtuullinen näytönohjain. Sitten kukin perhe valitsee ottaako sen käyttöön. Työt jonotetaan, joten tietokone voi nukkua ja herätä, kun on tekemistä."
      },
      {
        "tips": [
          "Kaikki tekoälyn ehdotukset näytetään sinulle ennen tallennusta.",
          "Ilman tekoälyä voit yhä kopioida kysymyksen valitsemallesi tekoälylle."
        ]
      }
    ]
  },
  "websearch": {
    "title": "Haku verkosta",
    "summary": "Hae palvelimen omalla hakukoneella – vain sanat lähtevät.",
    "blocks": [
      {
        "p": "Kun palvelimen ylläpitäjä on ottanut haun käyttöön, voit hakea verkosta Smooth Familysta: toiveita ja lahjoja, reseptejä, kodin tavaroiden käyttöohjeita, tietoja autosta ja tekemistä. Haku toimii omalla palvelimellanne (SearXNG), joten vain hakusanat lähtevät – ei se, kuka kysyy."
      },
      {
        "p": "Paikallisen tekoälyn avulla voit myös kysyä kysymyksen ja saada vastauksen lähteineen verkosta."
      }
    ]
  },
  "family": {
    "title": "Perheen asetukset",
    "summary": "Jäsenet, mitä sovelluksia kukin näkee, ja perheen arki.",
    "blocks": [
      {
        "p": "Perheen asetukset ovat perhettä hoitavalle. Ylläpitäjä lisää jäsenet ja valitsee, mitä sovelluksia kukin näkee; aikuinen, johon ylläpitäjä luottaa, voi saada luvan muuttaa myös arjen asetuksia."
      },
      {
        "shot": "family",
        "caption": "Kaikki perheessä; avaa yksi nähdäksesi kaiken hänestä."
      },
      {
        "h": "Jäsenen oma sivu"
      },
      {
        "p": "Napauta jäsentä nähdäksesi kaiken hänestä yhdessä paikassa: nimi, väri ja kuva, uusi salasana ja kaksivaiheisen kirjautumisen nollaus, mitä sovelluksia hän käyttää – ja lapselta sovelluksen kieli, syntymäpäivä, Pikkutila, viikkoraha, lääkkeet ja hätäkortti. Aikuisen omat lääkkeet pysyvät yksityisinä, ja aikuiset valitsevat itse kuvansa."
      },
      {
        "h": "Mitä missäkin"
      },
      {
        "p": "Perheenjäsenet: kaikki, jokaisella oma sivunsa (kirjautuminen, sovellukset, kieli, kuva – ja lapselta syntymäpäivä, viikkoraha, Pikkutila, kaksi kotia, lääkkeet ja hätäkortti), muut ihmiset ilman tiliä syntymäpäiviä varten sekä vieraslinkit lapsenvahdille tai isovanhemmille. Arki: kalenterit, koti, Tänään-näkymän lähteet, pistesäännöt, kotitalouden hätäkortti ja lemmikkien lääkkeet. Keittiön näyttö. Yhteydet: älykoti ja paikallinen tekoäly. Turvallisuus ja tiedot: varmuuskopiot ja vienti."
      },
      {
        "tips": [
          "Anna lapsen syntymäpäivä, kun lisäät hänet – 6-vuotias tai nuorempi lapsi aloittaa Pikkutilassa.",
          "Perheen aloitusoppaan voi avata uudelleen Perheen asetusten yläreunasta.",
          "Uusi jäsen aloittaa ylläpitäjän kielellä; vanhempi vaihtaa lapsen kielen lapsen sivulla."
        ]
      }
    ]
  },
  "familydata": {
    "title": "Perheen tiedot ja varmuuskopiot",
    "summary": "Vienti, perheen oma avain ja perheen siirtäminen.",
    "blocks": [
      {
        "p": "Kohdassa Perheen asetukset → Turvallisuus ja tiedot ylläpitäjä voi viedä perheen tiedot ja toisten ylläpitämällä palvelimella valita perheelle oman varmuuskopioavaimen: perheen varmuuskopiot sinetöidään silloin niin, että vain te voitte avata ne – ei edes palvelimen ylläpitäjä."
      },
      {
        "shot": "familydata",
        "caption": "Perheen varmuuskopiot ja avain."
      },
      {
        "tips": [
          "Säilytä avain palvelimen ulkopuolella kuin tärkeä salasana – ilman sitä varmuuskopioita ei voi palauttaa.",
          "Loki näyttää kirjautumiset ja muutokset perheessä."
        ]
      }
    ]
  },
  "profile": {
    "title": "Oma profiili",
    "summary": "Nimesi, kuvasi, kieli, valikko, ilmoitukset ja turvallisuus.",
    "blocks": [
      {
        "p": "Oma profiili -sivulla on neljä välilehteä. Minä: nimi, kuva, kieli ja teema, hätäkorttisi ja omat lääkkeesi. Valikko: sovellusten järjestys ja piilotetut. Ilmoitukset: mitä lähetetään, ja aamuyhteenveto. Turvallisuus ja yhteydet: salasana, pääsyavaimet, kaksivaiheiset koodit ja puhelimen kalenteri."
      },
      {
        "shot": "profile",
        "caption": "Oma profiili."
      }
    ]
  },
  "server": {
    "title": "Palvelimen asetukset",
    "summary": "Palvelinta hoitavalle: perheet, kirjautumissäännöt, osoite ja loki.",
    "blocks": [
      {
        "p": "Palvelimen ylläpitäjä päättää, mikä on kaikille palvelimen perheille sama. Kutsu muita perheitä linkillä – he voivat kokeilla demoa ensin – ja keskeytä, siirrä tai poista perhe. Ylläpitäjä ei koskaan näe perheiden sisältöä."
      },
      {
        "shot": "server",
        "caption": "Palvelimen perheet."
      },
      {
        "p": "Turvallisuus asettaa säännöt pääsyavaimille, kaksivaiheisille koodeille ja salasanojen pituudelle. Osoite ja palvelut sisältää palvelimen internet-osoitteen, haun ja kaikkien perheiden palvelut. Palvelimen aloitusoppaan voi avata uudelleen yläreunasta."
      }
    ]
  },
  "serverbackups": {
    "title": "Varmuuskopiot ja varmuuskopioavain",
    "summary": "Varmuuskopio joka yö, sinetöity avaimella, joka on vain sinulla.",
    "blocks": [
      {
        "p": "Palvelin tekee varmuuskopion joka yö ja säilyttää 30 päivää. Varmuuskopioavaimella ne sinetöidään: palvelin voi tehdä ne mutta ei koskaan lukea niitä, ja avain riittää palauttamaan kaiken uudelle palvelimelle."
      },
      {
        "shot": "serverbackups",
        "caption": "Varmuuskopiot avaimella sinetöityinä."
      },
      {
        "steps": [
          "Palvelimen asetukset → Varmuuskopiot ja siirto → Luo varmuuskopioavain. Avain luodaan selaimessasi; palvelin saa vain sen julkisen puolen.",
          "Tallenna se salasanojen hallintaan, tulosta tai lataa se – ja vahvista viimeisillä merkeillä.",
          "Kokeile avainta uusimpaan varmuuskopioon kohdasta Kokeile avaintani."
        ]
      },
      {
        "note": "Ilman avainta varmuuskopioita ei voi palauttaa, eikä kukaan voi luoda sitä sinulle uudelleen."
      }
    ]
  },
  "serverupdates": {
    "title": "Päivitykset",
    "summary": "Smooth Family ja palvelimen osat itsestään – ja yhdyskäytävien versiot.",
    "blocks": [
      {
        "p": "Tietokanta, Redis, verkkopalvelin ja hakukone saavat tietoturvakorjauksia Smooth Familyn julkaisujen välillä. Valitse, asennetaanko ne itsestään viikoittaisessa ikkunassa vai hyväksyntäsi jälkeen. Ensin tehdään varmuuskopio, ja jos uudet versiot eivät käynnisty, vanhat palautetaan."
      },
      {
        "shot": "serverupdates",
        "caption": "Versiot, ikkuna ja yhdyskäytävät."
      },
      {
        "h": "Smooth Family itse"
      },
      {
        "p": "Valitse kanava kohdassa Smooth Family itse, niin palvelin päivittää myös sovelluksen muiden kanssa samaan aikaan: Vakaa seuraa julkaisuja, Beta jokaista muutosta heti valmistuttuaan. Vain projektin allekirjoittamat versiot asennetaan, tietokanta tallennetaan ensin, ja jos uusi versio ei käynnisty, vanha tietokantoineen palautetaan. Pois päältä, kunnes valitset – etsiminen on kutsu GitHubiin."
      },
      {
        "p": "Yhdyskäytävät-kortti näyttää jokaisen palvelimen yhdyskäytävän, kunkin ilmoittaman version ja sen, päivittyykö se itse – joten näet, että kaikki ovat ajan tasalla."
      },
      {
        "note": "Palvelimen update.sh täytyy ajastaa kerran tunneittain (Synologyssa: Tehtävien ajoitus, käyttäjä root), jotta päivitykset asennetaan."
      }
    ]
  },
  "serverservices": {
    "title": "Palvelut, paikallinen tekoäly ja haku",
    "summary": "Palvelimen osoite, hakukone, paikallinen tekoäly ja muut palvelut.",
    "blocks": [
      {
        "p": "Osoite ja palvelut sisältää osoitteen, josta palvelin tavoitetaan – sitä käytetään kaikissa lähetettävissä linkeissä – resepti- ja verkkohaun (SearXNG palvelimella itsellään), Home Assistantin palvelimen perheille yhdyskäytävän kautta, GIFit chatissa ja palautteen lähettämisen. Tekoälykone asettaa, missä Ollama toimii, mitä malleja käytetään, sekä tietokoneen herätyksen ja lepotilan. Sähköposti ottaa käyttöön sähköpostipalvelut – Gmail sovellussalasanalla, Brevo oman verkkotunnuksen osoitteelle, Exchange Online Microsoft Entran sovellusrekisteröinnin kautta tai muu SMTP-palvelin – ja valitsee, millä perheenne lähettää ja saavatko isännöidyt perheet lähettää sähköpostia (juhlavieraille, jotka pyysivät päivityksiä). Osoitteet ottaa käyttöön OpenStreetMapin ehdotukset osoitekentissä (komootin Photonin tai oman kautta) – tai poistaa ne."
      },
      {
        "shot": "serverservices",
        "caption": "Palvelimen palvelut."
      }
    ]
  },
  "feedback": {
    "title": "Raportoi ongelma",
    "summary": "Jokin vialla tai toive – palvelimen ylläpitäjälle.",
    "blocks": [
      {
        "p": "Löysitkö jotain, mikä ei toimi, tai toivotko jotain uutta? Kirjoita se profiilivalikon kohtaan Raportoi ongelma. Se menee palvelinta hoitavalle henkilölle sivun, jolla olit, ja selaimesi kanssa – ja kuvakaappauksen kera, jos lisäät sellaisen."
      },
      {
        "steps": [
          "Avaa profiilivalikko → Raportoi ongelma.",
          "Valitse Jokin on vialla tai Toive ja kirjoita, mitä tapahtui tai mitä toivot.",
          "Lisää kuvakaappaus, jos se auttaa – liitä, pudota tai ota kuva."
        ]
      },
      {
        "tips": [
          "Näet raporttisi samalla sivulla: vastaanotettu, suunnitteilla, korjattu tai ei suunnitteilla – ja ylläpitäjän rivin, jos sellainen on.",
          "Saat ilmoituksen, kun raportin tila muuttuu.",
          "Perheen ylläpitäjä näkee koko perheen raportit."
        ]
      }
    ]
  },
  "devices": {
    "title": "Laitteet",
    "summary": "Mitä perheen tilillä on yhdistetty, ja voiko se hyvin.",
    "blocks": [
      {
        "p": "Perheen asetukset → Laitteet näyttää, mikä on yhteydessä palvelimeen perheen puolesta: puhelimet ja tietokoneet, joilla jäsenet kirjautuvat, keittiön näytöt ja yhdyskäytävät – Home Assistant -sovelluksena tai omana konttinaan. Kartta sijoittaa ne palvelimen ympärille; listassa on kunkin versio, milloin se viimeksi nähtiin ja sen kunto."
      },
      {
        "shot": "devices",
        "caption": "Perheen laitteet palvelimen ympärillä."
      },
      {
        "h": "Kunto"
      },
      {
        "p": "Vihreä: kunnossa. Oranssi: vanha versio – sovellus, joka pitää avata uudelleen, tai päivitettävä yhdyskäytävä. Harmaa: jäsenen laite, jota ei ole käytetty hetkeen. Punainen: keittiön näyttö tai yhdyskäytävä, joka ei ole paikalla. Listassa kerrotaan, mitä tehdä laitteelle, joka ei voi hyvin."
      },
      {
        "tips": [
          "Laite, jota ei ole nähty 7 päivään, poistuu kartalta mutta jää listaan; jäsenen vanhan puhelimen voi unohtaa siellä.",
          "Vain laitteen tyyppi, selain ja järjestelmä, sovelluksen versio ja viimeisin käyttö tallennetaan – ei osoitetta, ei sijaintia.",
          "Palvelimen ylläpitäjä näkee laitteenne tyyppeinä, ei koskaan nimiä, ja voi pyytää teitä tarkistamaan jonkin."
        ]
      }
    ]
  },
  "serverreports": {
    "title": "Perheiden raportit",
    "summary": "Lue, vastaa ja välitä virheet ja toiveet eteenpäin.",
    "blocks": [
      {
        "p": "Kaikkien perheiden virhe- ja toiveraportit tulevat kohtaan Palvelimen asetukset → Raportit, ja saat ilmoituksen. Avaa raportti lukeaksesi sen sivun, selaimen ja kuvakaappauksen kera; aseta tila – vastaanotettu, suunnitteilla, korjattu tai ei suunnitteilla – ja kirjoita rivi raportoijalle, joka saa tiedon."
      },
      {
        "h": "Projektille"
      },
      {
        "p": "Valitse raportit, joista Smooth Family -projektin pitäisi tietää, ja paina Vie. Saat nimettömän tekstin – mitä ja missä, ei koskaan kuka tai mikä perhe – ja GitHubin lomake projektin julkisessa repossa avautuu täytettynä sillä ja tunnisteella from-server-admin. Lue se läpi ja paina siellä Create. Linkkiin liian pitkä teksti kopioidaan, jotta voit liittää sen."
      },
      {
        "tips": [
          "Palvelin ei lähetä mitään: vienti vain avaa GitHubin selaimessasi.",
          "Viedyt raportit merkitään, joten et lähetä niitä kahdesti."
        ]
      }
    ]
  },
  "serverdevices": {
    "title": "Perheiden laitteet",
    "summary": "Jokaisen perheen laitteet tyypeittäin, versiot ja kunto.",
    "blocks": [
      {
        "p": "Palvelimen asetukset → Laitteet sijoittaa palvelimen keskelle ja jokaisen perheen sen ympärille, ja jokaisen perheen ympärille sen laitetyypit: puhelimet, tabletit, tietokoneet, keittiön näytöt, yhdyskäytävät ja Home Assistant -sovellukset. Näet, kuinka monta, mitä versioita ne käyttävät ja voivatko ne hyvin – et koskaan kenen ne ovat tai mitkä niiden nimet ovat."
      },
      {
        "p": "Sovelluksen versio on palvelimen oma; yhdyskäytävän pitäisi käyttää uusinta palvelimen jakamaa versiota. Kun perheellä on laite, jossa on vanha versio tai joka ei ole paikalla, Pyydä perhettä tarkistamaan lähettää perheen ylläpitäjille ilmoituksen siitä, mitkä tyypit ja miksi."
      },
      {
        "tips": [
          "Laite, jota ei ole nähty 7 päivään, poistuu kartalta.",
          "Yhdyskäytävä päivittyy itse, jos automaattiset päivitykset ovat päällä – vanha tarkoittaa yleensä, että ne ovat pois päältä."
        ]
      }
    ]
  }
};

export default texts;
