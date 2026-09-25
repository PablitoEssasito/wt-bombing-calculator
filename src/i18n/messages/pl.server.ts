import type { ServerMessages } from "@/i18n/messages";

/** Polish counterpart of en.server.ts. */
export const plServer: ServerMessages = {
  meta: {
    aboutTitle: "O stronie",
    aboutDescription: "Co robi kalkulator i skąd biorą się liczby.",
  },

  about: {
    title: "O stronie",
    intro: "Co zabrać — dla każdego samolotu i każdej bazy — wyliczone dla BR i trybu gry, w którym naprawdę grasz.",
    coffeeText: "Za darmo, bez reklam — jeśli pomogło, kawa zawsze mile widziana.",
    whatsHere: "Co tu jest",
    features: [
      "Wyszukiwarka {aircraft} samolotów z filtrami nacji i BR, a dla każdego samolotu plan zrzutu przeliczany na bieżąco przy zmianie BR, trybu gry czy liczby baz.",
      "Każda notatka do zestawu przypisana do tego, co naprawdę znaczy — polecane, warto wiedzieć, uwaga albo odradzane — zamiast gołego znacznika, nad który trzeba najechać.",
      "Kreator uzbrojenia wzorowany na menu uzbrojenia z gry: pylon po pylonie, z pilnowanymi limitami masy i wzajemnymi wykluczeniami oraz oznaczonymi brakującymi zależnościami — zbudowany z plików danych gry, a nie zgadywany z samych zestawów.",
      "Sortowalna tabela bomb z osobnym kalkulatorem dla dowolnej bomby i dowolnej wytrzymałości bazy — łącznie z rakietami, wycenionymi ręcznie według danych z hangaru gry, a nie zostawionymi pustymi.",
      "Samoloty premium i dywizjonowe wyróżnione tak jak w samej grze — złotem i zielenią — żeby w wynikach wyszukiwania nie trzeba było klikać, by je odróżnić.",
      "Każde ustawienie siedzi w adresie URL, więc konkretna konfiguracja to jeden link do udostępnienia.",
    ],
    creditBuilt:
      "Kreator uzbrojenia, każdy przeliczony plan, obrażenia rakiet (sprawdzone w grze, jedna po drugiej) i ikony są budowane tutaj z plików samego War Thunder. Ręcznie dopracowane plany zrzutu i obrażenia bomb pochodzą z",
    creditPulled: ", ostatnio pobrane {date}.",
    howNumbers: "Jak działają liczby",
    bleed:
      "Baza dopala się sama, gdy straci większość wytrzymałości, więc wystarczy zadać jej tylko część — {bleed} całości. Liczba bomb jednego typu to zatem:",
    formula: "bomby = ceil(wytrzymałość bazy × {bleed} ÷ obrażenia bomby)",
    tiers:
      "Wytrzymałość bazy zależy od BR bitwy, a nie twojego samolotu, i rośnie w {count} progach od {min} do {max}. Bazy w trybie zręcznościowym mają podwójną wytrzymałość. Mapy z trzema bazami mają własne progi, od {threeMin} do {threeMax}.",
    cannotTell: "Czego nie powie",
    limits: [
      "Które zestawy gra faktycznie oferuje. Plany zrzutu to uwzględniają, bo zostały napisane ręcznie; przeliczone zakładają, że można zabrać dowolną mieszankę.",
      "Limity na skrzydło i wyważenia, które gra podaje obok ogólnego limitu masy. Nic w modelu lotu nie mówi, na którym skrzydle jest dany węzeł, a zgadywanie blokowałoby całkowicie legalne zestawy — dlatego kreator sprawdza tylko sumę.",
    ],
    renders: "Rendery samolotów",
    rendersText:
      "Obrazki to rendery z encyklopedii gry, te same, których używa wiki War Thunder. To grafiki Gaijin, pokazane tu, żeby łatwiej było rozpoznać samolot.",
    translations: "Tłumaczenia",
    translationsText:
      "Polskie i rosyjskie nazwy samolotów i uzbrojenia pochodzą prosto z plików lokalizacji gry. Resztę przetłumaczono dla tej strony; notatki z arkusza zostają po angielsku, tak jak napisał je autor.",
    legal: "Informacje prawne",
    legalText:
      "Strona niezwiązana z Gaijin Entertainment, przez nią niepopierana ani z nią niepowiązana. War Thunder i wszystkie powiązane znaki należą do ich właścicieli.",
  },

  site: {
    title: "Kalkulator bombardowania baz do War Thunder",
    shortTitle: "Kalkulator bomb WT",
    description:
      "Ile bomb zabrać i co zrzucić na każdą bazę — dla każdego bombowca i samolotu szturmowego w War Thunder.",
    appDescription:
      "Ile bomb zabrać i co zrzucić na każdą bazę — dla każdego bombowca i samolotu szturmowego w War Thunder.",
  },

  footer: {
    builtFrom:
      "Kreator uzbrojenia, przeliczone plany zrzutu, dane rakiet i ikony z gry zbudowane na podstawie plików samego War Thunder.",
    handTuned: "Ręcznie dopracowane plany zrzutu i obrażenia bomb pochodzą z",
    legion: "LEGION's Loadouts",
    notAffiliated: "Strona niezwiązana z Gaijin Entertainment ani przez nią nie popierana.",
    lastUpdate: "Ostatnia aktualizacja:",
  },

  categories: {
    "tt-bomber": "Drzewko badań · bombowiec/szturmowiec",
    "tt-fighter": "Drzewko badań · myśliwiec",
    "premium-bomber": "Premium · bombowiec/szturmowiec",
    "premium-fighter": "Premium · myśliwiec",
  },

  stats: {
    bombsAndRockets: {
      one: "{n} bomba lub rakieta",
      few: "{n} bomby i rakiety",
      many: "{n} bomb i rakiet",
      other: "{n} bomby i rakiety",
    },
    nations: { one: "{n} nacja", few: "{n} nacje", many: "{n} nacji", other: "{n} nacji" },
    sheet: "Arkusz v{version}",
    patch: "Patch {version}",
    latest: "Najnowszy: {what}",
    latestPatch: "patch {version} · {date}",
    updates: {
      one: "{n} aktualizacja",
      few: "{n} aktualizacje",
      many: "{n} aktualizacji",
      other: "{n} aktualizacji",
    },
    aircraft: { one: "{n} samolot", few: "{n} samoloty", many: "{n} samolotów", other: "{n} samolotu" },
    bombs: { one: "{n} bomba", few: "{n} bomby", many: "{n} bomb", other: "{n} bomby" },
  },

  home: {
    heading: "Ile bomb naprawdę potrzebujesz?",
    intro:
      "Wybierz samolot i dostań plan zrzutu: co zrzucić na każdą bazę, ile baz zniszczysz i który zestaw uzbrojenia zarabia najwięcej, wciąż robiąc swoje.",
    covers: "Obejmuje {aircraft} samolotów i {bombs} bomb.",
    facts: [
      {
        title: "Małe bomby biją mocniej",
        text: "Garść lekkich bomb robi bazie znacznie więcej niż jedna ciężka. Cztery bomby 500 lb biją pojedynczą 3000 kg, mimo mniejszej ilości materiału wybuchowego.",
      },
      {
        title: "Bazy rosną z BR",
        text: "Wytrzymałość bazy rośnie w sześciu progach, od 4000 na dole do 25 900 na górze, więc uptier zmienia to, co warto zabrać.",
      },
      {
        title: "Lataj na lekko",
        text: "Mnożnik nagrody spada wraz z ładunkiem. Zabieranie więcej bomb, niż potrzebują bazy, kosztuje cię punkty badań za nic.",
      },
    ],
  },

  notFound: {
    heading: "Ta strona nie istnieje",
    text: "Pod tym adresem nie ma samolotu, bomby ani strony.",
    back: "← Wróć do wszystkich samolotów",
  },

  error: {
    heading: "Coś się zepsuło na tej stronie.",
    text: "Zwykle pomaga przeładowanie.",
  },
};
