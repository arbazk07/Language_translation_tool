# Tongue — Language Translation Tool

A web-based language translator with auto language detection, instant
swap, copy-to-clipboard, and text-to-speech.

## What it does

- Type text, pick (or auto-detect) a source language, pick a target language.
- Get an instant translation powered by Google Translate (via `deep-translator`).
- Swap source ↔ target with one click.
- Copy the translation to your clipboard.
- Listen to the translation read aloud using the browser's built-in
  text-to-speech (no external API, works offline).

## Tech stack

| Layer    | Tech                                  |
|----------|----------------------------------------|
| Backend  | Python, Flask, `deep-translator`       |
| Frontend | HTML, CSS, vanilla JavaScript           |
| Speech   | Browser `SpeechSynthesis` Web API      |

## Project structure

```
language-translation-tool/
├── backend/
│   ├── app.py            # Flask server + API routes
│   └── translator.py     # Core translation logic
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
└── requirements.txt
```

## How it works

1. **`translator.py`** wraps `deep-translator`'s `GoogleTranslator` and always
   returns a predictable `{"success": ..., ...}` shape, whether the
   translation succeeds or fails.
2. **`app.py`** exposes two JSON API routes:
   - `GET /api/languages` — returns every supported language as `{name: code}`.
   - `POST /api/translate` — accepts `{text, source_lang, target_lang}`, returns
     the translated text.
3. **`script.js`** loads the language list on page load (so dropdowns are
   never hardcoded), sends translate requests via `fetch()`, and handles
   swap / copy / speak / loading / error states.

## Running it locally

```bash
pip install -r requirements.txt
cd backend
python app.py
```

Open `http://localhost:5000` in your browser.

## Notes

- Translation requires an internet connection (it calls Google Translate
  under the hood).
- "Listen" quality depends on which voices your OS/browser has installed —
  common languages (Spanish, French, German, Arabic, etc.) almost always
  work; rarer ones may show a "no voice installed" notice.
