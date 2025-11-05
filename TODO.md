# TODO: Enhance Flask App for Automatic Language Detection

- [x] Modify `handle_voice_text` in `application.py` to detect language using `translator.detect()` on input text, then translate to Hindi and English, and emit detected language.
- [x] Modify `handle_audio_data` in `application.py` to detect language on recognized speech text, then translate to Hindi and English, and emit detected language.
- [x] Add error handling in both handlers for detection failures (e.g., offline or unsupported text).
- [x] Test the app online to verify language detection and translations for various languages.
