"""
translator.py
--------------
This is the CORE LOGIC of our translation tool, separated from the web server.

Why separate it? Good practice: keep "business logic" (the actual translation)
apart from "web logic" (Flask routes, request handling). This means:
  1. You can test translation logic without running a server.
  2. You can swap the translation engine later (e.g., Google -> DeepL)
     without touching your Flask routes.
"""

from deep_translator import GoogleTranslator
from deep_translator.exceptions import LanguageNotSupportedException

# Maximum characters we'll accept per translation request. Free translation
# APIs aren't built for large paragraphs, and without a cap, anyone calling
# this API directly (bypassing the frontend's own maxlength) could send an
# arbitrarily large payload.
MAX_TEXT_LENGTH = 3000

# get_supported_languages() rarely changes — Google doesn't add new
# languages often — so we cache the result after the first call instead of
# hitting the network again on every single page load. None means "not
# fetched yet."
_cached_languages = None


def get_supported_languages():
    """
    Returns a dict of {language_name: language_code}, e.g. {"english": "en", "spanish": "es"}.
    deep_translator already maintains this list for Google Translate.
    Cached after the first call — see _cached_languages above.
    """
    global _cached_languages
    if _cached_languages is None:
        _cached_languages = GoogleTranslator().get_supported_languages(as_dict=True)
    return _cached_languages


def translate_text(text: str, source_lang: str, target_lang: str) -> dict:
    """
    Translates `text` from `source_lang` to `target_lang`.

    Parameters:
        text (str): the text the user typed
        source_lang (str): language code, e.g. "en", or "auto" to auto-detect
        target_lang (str): language code, e.g. "es"

    Returns:
        dict: {"success": True, "translated_text": "..."} on success
              {"success": False, "error": "..."} on failure

    We return a dict (not just a string) so our Flask route can easily
    convert this into a JSON response with a clear success/failure shape.
    This is a common API design pattern: ALWAYS return a predictable shape,
    even when something goes wrong, so the frontend doesn't have to guess.
    """
    # Guard clause: don't even call the API for empty input.
    # This saves a network call and gives instant feedback.
    if not text or not text.strip():
        return {"success": False, "error": "Please enter some text to translate."}

    # Enforce the length cap server-side too — the frontend's maxlength
    # attribute is easy to bypass by calling this API directly, so the
    # real limit has to live here, not just in the HTML.
    if len(text) > MAX_TEXT_LENGTH:
        return {"success": False, "error": f"Text is too long (max {MAX_TEXT_LENGTH} characters)."}

    try:
        translator = GoogleTranslator(source=source_lang, target=target_lang)
        translated = translator.translate(text)
        return {"success": True, "translated_text": translated}

    except LanguageNotSupportedException:
        return {"success": False, "error": "One of the selected languages isn't supported."}

    except Exception as e:
        # Catch-all: network errors, API hiccups, etc.
        # In production you'd log `e` somewhere instead of just swallowing it.
        return {"success": False, "error": f"Translation failed: {str(e)}"}


# This block only runs if you execute `python translator.py` directly.
# It does NOT run when this file is imported by app.py.
# This is the standard way to add a "quick test" to a Python module.
if __name__ == "__main__":
    test_result = translate_text("Good morning, friend!", source_lang="en", target_lang="fr")
    print(test_result)
