/* ============================================
   script.js
   Connects the UI to our Flask backend.
   Three jobs:
     1. Load language list into both dropdowns on page load
     2. Send translate requests when the button is clicked
     3. Handle swap / copy / speak / loading states
   ============================================ */

// Grabbing every element we'll need ONCE at the top, rather than
// repeatedly calling document.getElementById() inside functions.
const sourceLangSelect = document.getElementById("sourceLang");
const targetLangSelect = document.getElementById("targetLang");
const sourceText = document.getElementById("sourceText");
const targetText = document.getElementById("targetText");
const translateBtn = document.getElementById("translateBtn");
const swapBtn = document.getElementById("swapBtn");
const copyBtn = document.getElementById("copyBtn");
const speakBtn = document.getElementById("speakBtn");
const errorMsg = document.getElementById("errorMsg");
const sourceCount = document.getElementById("sourceCount");
const transitGlyphs = document.getElementById("transitGlyphs");

let currentTranslation = ""; // stores the last successful translation, for copy/speak
let lastTargetLangCode = "es"; // tracks selected target language for text-to-speech

/* ============================================
   1. LOAD LANGUAGES ON PAGE LOAD
   ============================================ */
async function loadLanguages() {
  try {
    const response = await fetch("/api/languages");
    const languages = await response.json(); // e.g. {"english": "en", "spanish": "es", ...}

    // Populate the TARGET dropdown (every real language, no "auto detect" here)
    for (const [name, code] of Object.entries(languages)) {
      const optionTarget = document.createElement("option");
      optionTarget.value = code;
      optionTarget.textContent = capitalize(name);
      targetLangSelect.appendChild(optionTarget);

      // Populate the SOURCE dropdown too (it already has "Detect language" as option 1)
      const optionSource = document.createElement("option");
      optionSource.value = code;
      optionSource.textContent = capitalize(name);
      sourceLangSelect.appendChild(optionSource);
    }

    // Default target language: Spanish, if available
    targetLangSelect.value = "es";
    lastTargetLangCode = targetLangSelect.value;

  } catch (err) {
    showError("Couldn't load language list. Is the backend server running?");
  }
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/* ============================================
   2. TRANSLATE
   ============================================ */
async function handleTranslate() {
  const text = sourceText.value.trim();

  if (!text) {
    showError("Type something to translate first.");
    sourceText.focus();
    return;
  }

  setLoading(true);
  hideError();

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text,
        source_lang: sourceLangSelect.value,
        target_lang: targetLangSelect.value
      })
    });

    const result = await response.json();

    if (result.success) {
      renderTranslation(result.translated_text);
      playTransitAnimation(result.translated_text);
    } else {
      showError(result.error || "Something went wrong. Try again.");
    }

  } catch (err) {
    // This branch catches network failures (server not running, no internet, etc.)
    showError("Couldn't reach the server. Check your connection and try again.");
  } finally {
    setLoading(false);
  }
}

function renderTranslation(translatedText) {
  currentTranslation = translatedText;
  targetText.innerHTML = ""; // clear the "Translation appears here" placeholder
  targetText.textContent = translatedText;
  copyBtn.disabled = false;
  speakBtn.disabled = false;

  // Retrigger the entrance animation on every new translation, not just the first.
  // Removing the class then re-adding it on the next frame forces the browser
  // to replay the animation instead of ignoring a class that's "already there."
  targetText.classList.remove("settled");
  requestAnimationFrame(() => targetText.classList.add("settled"));
}

/* ============================================
   3. SWAP LANGUAGES
   ============================================ */
swapBtn.addEventListener("click", () => {
  // Can't swap if source is set to "Detect language" — there's nothing concrete to swap TO
  if (sourceLangSelect.value === "auto") {
    showError("Pick a specific source language before swapping.");
    return;
  }

  // Spin animation for visual feedback
  swapBtn.classList.add("spin");
  setTimeout(() => swapBtn.classList.remove("spin"), 300);

  // Swap the dropdown values
  const tempLang = sourceLangSelect.value;
  sourceLangSelect.value = targetLangSelect.value;
  targetLangSelect.value = tempLang;
  lastTargetLangCode = targetLangSelect.value;

  // Swap the text too, if there's a translation already
  if (currentTranslation) {
    const tempText = sourceText.value;
    sourceText.value = currentTranslation;
    renderTranslation(tempText);
    updateCharCount();
  }
});

/* ============================================
   4. COPY TO CLIPBOARD
   ============================================ */
copyBtn.addEventListener("click", async () => {
  if (!currentTranslation) return;

  try {
    await navigator.clipboard.writeText(currentTranslation);
    const label = copyBtn.querySelector("span");
    const originalLabel = label.textContent;
    label.textContent = "Copied!";
    setTimeout(() => { label.textContent = originalLabel; }, 1500);
  } catch (err) {
    showError("Couldn't copy. Your browser may have blocked clipboard access.");
  }
});

/* ============================================
   5. TEXT-TO-SPEECH ("Listen" button)
   Uses the browser's built-in SpeechSynthesis API —
   no external API needed, works fully offline.

   Why it was silently failing:
   1. Chrome loads its voice list ASYNCHRONOUSLY. If you call speak()
      before voices finish loading, some browsers just drop the request.
   2. Many language codes (e.g. "ar" alone) don't exactly match an
      installed voice's lang tag (often "ar-SA", "ar-EG", etc.), so the
      browser can fail to find a matching voice and stay silent instead
      of throwing a visible error.
   We fix this by: waiting for voices to load, finding the closest
   matching voice ourselves, and showing a clear error if truly none exists.
   ============================================ */

let availableVoices = [];

function loadVoices() {
  availableVoices = window.speechSynthesis.getVoices();
}

// Voices may load immediately OR fire this event later — covering both
loadVoices();
if ("onvoiceschanged" in window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function findVoiceForLang(langCode) {
  if (availableVoices.length === 0) return null;

  // Exact match first, e.g. "es" === "es"
  let match = availableVoices.find(v => v.lang.toLowerCase() === langCode.toLowerCase());
  if (match) return match;

  // Fallback: prefix match, e.g. requested "ar" matches installed "ar-SA"
  match = availableVoices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase()));
  return match || null;
}

speakBtn.addEventListener("click", () => {
  if (!currentTranslation) return;

  if (!("speechSynthesis" in window)) {
    showError("Text-to-speech isn't supported in this browser.");
    return;
  }

  // Cancel anything currently speaking, so clicks don't stack up
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(currentTranslation);
  const voice = findVoiceForLang(lastTargetLangCode);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    // No installed voice for this language — still try with the lang code set,
    // some browsers can synthesize anyway, but warn the user it may not play.
    utterance.lang = lastTargetLangCode;
    showError("No voice installed for this language — it may not play on your device.");
  }

  speakBtn.classList.add("speaking");
  utterance.onend = () => speakBtn.classList.remove("speaking");
  utterance.onerror = () => {
    speakBtn.classList.remove("speaking");
    showError("Couldn't play audio for this language.");
  };

  window.speechSynthesis.speak(utterance);
});

/* ============================================
   6. CHARACTER COUNTER
   ============================================ */
function updateCharCount() {
  sourceCount.textContent = `${sourceText.value.length} / 3000`;
}
sourceText.addEventListener("input", updateCharCount);

/* ============================================
   7. LOADING STATE
   ============================================ */
function setLoading(isLoading) {
  translateBtn.classList.toggle("loading", isLoading);
  translateBtn.disabled = isLoading;
}

/* ============================================
   8. ERROR HANDLING
   ============================================ */
function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.add("show");
}

function hideError() {
  errorMsg.classList.remove("show");
}

/* ============================================
   9. SIGNATURE ANIMATION
   A few words from the translation drift across
   the swap zone when translation completes.
   ============================================ */
function playTransitAnimation(translatedText) {
  // Grab up to 2 short "glyph" snippets from the translation to animate
  const words = translatedText.split(" ").filter(Boolean).slice(0, 2);
  if (words.length === 0) return;

  words.forEach((word, i) => {
    const glyph = document.createElement("span");
    glyph.className = "transit-glyph fly";
    glyph.textContent = word;
    glyph.style.animationDelay = `${i * 0.12}s`;
    glyph.style.top = `${-10 + i * 16}px`;
    transitGlyphs.appendChild(glyph);

    // Clean up the element after its animation finishes (0.9s) so the
    // DOM doesn't accumulate leftover elements on repeated translations
    setTimeout(() => glyph.remove(), 1000);
  });
}

/* ============================================
   10. KEYBOARD SHORTCUT
   Ctrl+Enter (or Cmd+Enter on Mac) triggers translate —
   a small but appreciated UX touch.
   ============================================ */
sourceText.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    handleTranslate();
  }
});

/* ============================================
   INIT
   ============================================ */
translateBtn.addEventListener("click", handleTranslate);
loadLanguages();
