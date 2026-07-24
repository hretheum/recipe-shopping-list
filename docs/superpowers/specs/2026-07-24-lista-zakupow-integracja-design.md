# Integracja Obsidian → lista zakupów: założenia projektowe

**Data:** 2026-07-24
**Status:** zatwierdzone do planowania implementacji

## Cel

Umożliwić wybranie jednego lub dwóch plików markdown z przepisami (notatki Obsidian, dodawane przez Obsidian Web Clipper) i przeniesienie z nich listy składników do mobilnej aplikacji zakupowej — ze znormalizowanymi jednostkami i zsumowanymi ilościami, jeśli ten sam składnik występuje w więcej niż jednym przepisie.

## Kontekst wejściowy

Przepisy mają ustandaryzowaną strukturę (szablon Obsidian Web Clipper):

- YAML frontmatter: `type: "recipe"`, `source`, `site`, `tags`
- Sekcja `## Ingredients` jako tabela markdown z kolumnami `Original` i `PL + SI`
- Kolumna `PL + SI` bywa już częściowo znormalizowana ręcznie/przez klipper (np. skrócone opisy), ale ilości i jednostki nie są ujednolicone między przepisami (np. "1–2 łyżki koperku" vs. "duża garść koperku")

Przykład referencyjny: `/Users/eorlowski/Documents/prv-sync/source/prv/kukbuk/Najlepsze schabowe na świecie.md`

## Wybrana architektura

Rozdzielamy dwie odpowiedzialności:

1. **Normalizacja i sumowanie ilości** — dzieje się w naszym własnym pipeline, nie w aplikacji zakupowej.
2. **Docelowa aplikacja zakupowa** — dostaje już gotowy, znormalizowany tekst i tylko go przechowuje/wyświetla na telefonie.

To pozwala wybrać dowolną aplikację jako cel, bez zależności od tego, czy ma ona strukturalne pola ilość+jednostka.

### Rozważane opcje aplikacji docelowej (research)

| Aplikacja | Status API | Ryzyko | Ilość/jednostka |
|---|---|---|---|
| Listonic | brak publicznego API (tylko oferta B2B) | — | — |
| **Bring!** (wybrane) | nieoficjalne, reverse-engineered (`bring-api`, aktywnie utrzymywane, używane przez Home Assistant) | średnie — API może przestać działać przy zmianie backendu Bring | tylko wolny tekst (`specification`) |
| AnyList | nieoficjalne (`anylist` npm) | jak wyżej, bez przewagi nad Bring! | wolny tekst |
| Out of Milk | brak realnego API | — | — |
| Todoist | oficjalne, darmowe REST API | brak ryzyka ToS, ale limit 5 projektów na darmowym planie | brak pól strukturalnych, brak trybu "kupione" |
| Google Keep | tylko nieoficjalne (`gkeepapi`), rosnące problemy z logowaniem | wysokie | brak struktury |
| Grocy (self-hosted) | w pełni oficjalne REST API | zero ToS, ale wymaga własnego hostingu i product master data | pełna struktura, auto-sumowanie |
| Mealie (self-hosted) | w pełni oficjalne REST API, natywny dla przepisów | zero ToS, ale wymaga własnego hostingu, na telefonie tylko PWA | pełna struktura (quantity+unit+food) |

**Decyzja:** Bring! jako aplikacja docelowa — realnie używana na telefonie (iPhone), dojrzała biblioteka integracyjna, pełny CRUD (dodaj/edytuj/oznacz kupione). Świadomie akceptujemy ryzyko nieoficjalnego API; adapter do Bring! ma być izolowany i łatwo wymienny (np. na Mealie/Grocy), gdyby API przestało działać lub potrzeby wzrosły.

## Przepływ danych

```
[Notatki .md w Obsidian] (prv-sync/source/prv/kukbuk/*.md)
        │  użytkownik wskazuje 1-2 pliki
        ▼
[Parser markdown] → wyciąga tabelę "Ingredients" (kolumna "PL + SI")
        ▼
[Normalizator (lokalny LLM przez Ollama/llama.cpp)]
   - rozdziela ilość + jednostkę + nazwę składnika
   - sprawdza słownik ingredient_units.yaml
   - dla nieznanego składnika proponuje nowy wpis (do akceptacji użytkownika)
        ▼
[Sumator] → grupuje po znormalizowanej nazwie składnika, sumuje ilości
   (np. koperek: "1-2 łyżki" + "duża garść" → "2 pęczki")
        ▼
[Adapter Bring!] → loguje się (bring-api), dodaje/aktualizuje pozycje na liście
        ▼
[Podsumowanie w terminalu] → co dodano, co zsumowano, jakie nowe wpisy trafiły do słownika
```

## Sposób uruchamiania

- **Rdzeń:** skrypt CLI w Pythonie, np. `python groclip.py przepis1.md przepis2.md` — niezależny, testowalny, uruchamialny z terminala bez udziału Claude Code.
- **Wygoda:** cienki wrapper jako komenda/skill Claude Code, żeby można było poprosić w sesji "dodaj te przepisy do zakupów" bez przełączania się do terminala.
- Użytkownik zawsze wskazuje pliki ręcznie — brak automatycznego wykrywania/skanowania vaulta w MVP.

## Model danych

- **`ingredient_units.yaml`** — słownik: nazwa składnika → preferowana jednostka zakupowa + notatki. Trzymany w vaulcie lub folderze projektu, rośnie z czasem, edytowalny ręcznie. Przykład:
  ```yaml
  koperek: {unit: pęczek, note: "nie waż, kupuj pęczkami"}
  szczypiorek: {unit: pęczek}
  masło: {unit: "kostka (200g)"}
  mąka pszenna: {unit: kg, round_to: 0.5}
  ```
- **Wewnętrzny model znormalizowanej pozycji** (między etapem normalizacji a adapterem):
  ```
  {ingredient: str, quantity: float, unit: str, source_recipes: [str]}
  ```
- **Format do Bring!:** sklejony string wolnotekstowy, np. `"koperek — 2 pęczki"` (Bring! nie ma pól strukturalnych ilość/jednostka).

## Backend LLM

Lokalny serwer Ollama/llama.cpp (model Llama), wywoływany przez REST API bez kosztów per-token. Adres/port endpointu do potwierdzenia na etapie implementacji.

## Ryzyka

- **Stabilność API Bring!** — nieoficjalne, reverse-engineered; może przestać działać przy zmianie backendu. Mitygacja: izolowany, wymienny adapter.
- **Spójność normalizacji między uruchomieniami** — łagodzona przez trwały słownik `ingredient_units.yaml` zamiast decyzji LLM ad-hoc za każdym razem.
- **Dane logowania do Bring!** — do ustalenia: `keyring` (macOS Keychain) vs. lokalny `.env` poza synchronizowanym vaultem (żeby nie trafiły do prv-sync).

## Poza zakresem MVP

- Automatyczne wykrywanie/skanowanie plików przepisów w vaultcie
- Oznaczanie z powrotem w Obsidianie, które składniki zostały kupione
- Obsługa wielu aplikacji zakupowych jednocześnie
- Dedykowany plugin/UI w Obsidianie (na start: CLI + opcjonalny skill Claude Code)

## Otwarte pytania do etapu planowania implementacji

1. Dokładny adres/port lokalnego serwera Ollama i nazwa modelu do użycia.
2. Miejsce przechowywania danych logowania do Bring! (`keyring` vs `.env`).
3. Docelowa lokalizacja pliku `ingredient_units.yaml` (vault czy folder projektu).
