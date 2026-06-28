"""
app.py
------
This is the WEB layer. Its only job: receive HTTP requests from the browser,
call our translation logic (translator.py), and send back a JSON response.

Think of it like a receptionist: it doesn't do the actual work (that's
translator.py's job), it just takes requests, passes them to the right
person, and relays the answer back.
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from translator import translate_text, get_supported_languages

app = Flask(__name__)
CORS(app)  # Allows the frontend (even if opened from a different origin) to call this API

# Rate limiting protects both this server and Google's translate endpoint
# (which deep-translator calls under the hood) from being hammered by a
# single client — important for anything that might run publicly, not
# just on localhost. These numbers are generous for normal use but would
# stop a runaway script or scraper from making this unusable for everyone else.
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)


@app.route("/")
def serve_frontend():
    """
    Serves the frontend's index.html when someone visits http://localhost:5000/
    This lets us run ONE server for both frontend and backend during development.
    """
    return send_from_directory("../frontend", "index.html")


@app.route("/<path:filename>")
def serve_static_files(filename):
    """
    Serves any other frontend file requested (style.css, script.js, etc.)
    `<path:filename>` is a Flask URL converter — it captures whatever comes
    after the slash and passes it in as the `filename` variable.
    """
    return send_from_directory("../frontend", filename)


@app.route("/api/languages", methods=["GET"])
def languages():
    """
    GET /api/languages
    Returns all supported languages as JSON, e.g.:
    {"english": "en", "spanish": "es", "french": "fr", ...}

    The frontend calls this ONCE on page load to populate both dropdowns,
    instead of us hardcoding a language list in two places (backend + frontend).
    """
    return jsonify(get_supported_languages())


@app.route("/api/translate", methods=["POST"])
@limiter.limit("20 per minute")  # tighter limit on this specific endpoint, since it's the one calling out to Google's API
def translate():
    """
    POST /api/translate
    Expects a JSON body like:
        {"text": "Hello", "source_lang": "en", "target_lang": "fr"}

    Returns JSON like:
        {"success": true, "translated_text": "Bonjour"}
      or
        {"success": false, "error": "..."}
    """
    # silent=True makes get_json() return None instead of raising an
    # exception on malformed/missing JSON — without this, a request with
    # no body or broken JSON would crash with an unhandled 500 error
    # instead of a clean, predictable response.
    data = request.get_json(silent=True) or {}

    text = data.get("text", "")
    source_lang = data.get("source_lang", "auto")
    target_lang = data.get("target_lang", "en")

    result = translate_text(text, source_lang, target_lang)

    return jsonify(result)


if __name__ == "__main__":
    # debug=True auto-reloads the server when you save changes — great for development.
    # Turn this OFF (debug=False) if you ever deploy this publicly.
    app.run(debug=True, port=5000)
