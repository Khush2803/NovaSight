import base64
import io
import speech_recognition as sr
from flask import Flask, render_template
from flask_socketio import SocketIO, emit
try:
    from googletrans import Translator
except ImportError:
    Translator = None

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", engineio_logger=False, logger=False)
translator = Translator()
recognizer = sr.Recognizer()

@app.route('/')
def home():
    print("SERVER STARTED")
    return render_template('index.html')

@socketio.on('connect')
def test_connect():
    print("SOCKET CONNECTED")

@socketio.on('my event')
def handle_my_custom_event(json, methods=['GET', 'POST']):
    print('received my event: '+ str(json))

@socketio.on('voice_text')
def handle_voice_text(data):
    text = data.get('text', '')
    if text:
        try:
            # Detect language
            detected = translator.detect(text)
            detected_lang = detected.lang if detected else 'unknown'
            # Translate to Hindi
            hindi_translation = translator.translate(text, dest='hi').text
            # Translate to English
            english_translation = translator.translate(text, dest='en').text
            emit('translations', {
                'original': text,
                'hindi': hindi_translation,
                'english': english_translation,
                'detected_lang': detected_lang
            })
        except Exception as e:
            print(f"Translation error: {e}")
            emit('translations', {
                'original': text,
                'hindi': 'Translation failed',
                'english': 'Translation failed',
                'detected_lang': 'unknown'
            })

@socketio.on('audio_data')
def handle_audio_data(data):
    try:
        # Decode base64 PCM audio data
        pcm_bytes = base64.b64decode(data['audio'])
        pcm_data = io.BytesIO(pcm_bytes)

        # Convert to AudioData for speech recognition (16-bit PCM, 16kHz, mono)
        audio = sr.AudioData(pcm_bytes, 16000, 2)  # 16kHz, 16-bit

        # Try to recognize speech with multiple language options
        text = None
        detected_lang = 'en-US'  # default

        # Try English first
        try:
            text = recognizer.recognize_google(audio, language='en-US')
            detected_lang = 'en'
        except sr.UnknownValueError:
            # Try Hindi
            try:
                text = recognizer.recognize_google(audio, language='hi-IN')
                detected_lang = 'hi'
            except sr.UnknownValueError:
                # Try other languages if needed
                try:
                    text = recognizer.recognize_google(audio, language='es-ES')
                    detected_lang = 'es'
                except sr.UnknownValueError:
                    text = "Could not understand audio"
        except sr.RequestError as e:
            text = f"Speech recognition service error: {e}"

        if text and text != "Could not understand audio":
            # Detect language using Google Translator
            try:
                detected = translator.detect(text)
                detected_lang = detected.lang if detected else 'unknown'
            except Exception as e:
                print(f"Language detection error: {e}")
                detected_lang = 'unknown'
            # Translate to Hindi and English
            try:
                hindi_translation = translator.translate(text, dest='hi').text
                english_translation = translator.translate(text, dest='en').text

                emit('translations', {
                    'original': text,
                    'hindi': hindi_translation,
                    'english': english_translation,
                    'detected_lang': detected_lang
                })
            except Exception as e:
                print(f"Translation error: {e}")
                emit('translations', {
                    'original': text,
                    'hindi': 'Translation failed',
                    'english': 'Translation failed',
                    'detected_lang': detected_lang
                })
        else:
            emit('translations', {
                'original': text or "No speech detected",
                'hindi': '',
                'english': '',
                'detected_lang': 'unknown'
            })

    except Exception as e:
        print(f"Audio processing error: {e}")
        emit('translations', {
            'original': 'Audio processing failed',
            'hindi': '',
            'english': '',
            'detected_lang': 'error'
        })

if __name__ == '__main__':
    socketio.run(app)
