const video = document.getElementById('video');

var socket = io.connect('http://127.0.0.1:5000');
socket.on( 'connect', function() {
  console.log("SOCKET CONNECTED")
})

navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
Promise.all([
  faceapi.loadFaceLandmarkModel("http://127.0.0.1:5000/static/models/"),
  faceapi.loadFaceRecognitionModel("http://127.0.0.1:5000/static/models/"),
  faceapi.loadTinyFaceDetectorModel("http://127.0.0.1:5000/static/models/"),
  faceapi.loadFaceLandmarkModel("http://127.0.0.1:5000/static/models/"),
  faceapi.loadFaceLandmarkTinyModel("http://127.0.0.1:5000/static/models/"),
  faceapi.loadFaceRecognitionModel("http://127.0.0.1:5000/static/models/"),
  faceapi.loadFaceExpressionModel("http://127.0.0.1:5000/static/models/"),
])
  .then(startVideo)
  .catch(err => console.error(err));

function startVideo() {
  console.log("access");
  navigator.getUserMedia(
    {
      video: {},
      audio: true
    },
    stream => {
      video.srcObject = stream;
      // Don't auto-start speech recognition, let user click button
      console.log("Video and audio access granted");
    },
    err => console.error(err)
  )
}

// Add event listener for the voice recognition button
document.addEventListener('DOMContentLoaded', () => {
  const startVoiceBtn = document.getElementById('start-voice-btn');
  const voiceStatus = document.getElementById('voice-status');

  if (startVoiceBtn) {
    startVoiceBtn.addEventListener('click', () => {
      console.log("Voice recognition button clicked");
      voiceStatus.textContent = "Starting voice recognition...";
      startVoiceBtn.disabled = true;
      startVoiceBtn.textContent = "Listening...";
      startSpeechRecognition();
    });
  }
});

let mediaRecorder = null;
let audioChunks = [];

function startSpeechRecognition() {
  // Check if browser supports getUserMedia and Web Audio API
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Audio recording not supported in this browser. Please use Chrome or Edge.');
    return;
  }

  if (!window.AudioContext && !window.webkitAudioContext) {
    alert('Web Audio API not supported. Please use a modern browser.');
    return;
  }

  navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } })
    .then(stream => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      let audioChunks = [];

      processor.onaudioprocess = event => {
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        audioChunks.push(pcmData);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      console.log('Audio recording started');

      const voiceStatus = document.getElementById('voice-status');
      if (voiceStatus) {
        voiceStatus.textContent = "Recording... Speak now!";
      }

      // Stop recording after 3 seconds
      setTimeout(() => {
        source.disconnect();
        processor.disconnect();
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();

        // Combine all PCM chunks
        const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combinedPCM = new Int16Array(totalLength);
        let offset = 0;
        for (const chunk of audioChunks) {
          combinedPCM.set(chunk, offset);
          offset += chunk.length;
        }

        // Convert to base64
        const pcmBytes = new Uint8Array(combinedPCM.buffer);
        const base64Audio = btoa(String.fromCharCode(...pcmBytes));

        console.log('Sending PCM audio to server...');
        socket.emit('audio_data', { audio: base64Audio });

        console.log('Audio recording stopped');
      }, 3000);
    })
    .catch(error => {
      console.error('Error accessing microphone:', error);
      const voiceStatus = document.getElementById('voice-status');
      if (voiceStatus) {
        voiceStatus.textContent = "Microphone access denied or unavailable.";
      }
    });
}

function sendAudioToServer(audioBlob) {
  const reader = new FileReader();
  reader.onloadend = () => {
    const base64Audio = reader.result.split(',')[1]; // Remove data:audio/webm;base64, prefix
    console.log('Sending audio to server...');
    socket.emit('audio_data', { audio: base64Audio });
  };
  reader.readAsDataURL(audioBlob);
}

video.addEventListener('play', () => {
  // console.log('thiru');

  const canvas = faceapi.createCanvasFromMedia(video);
  document.body.append(canvas);
  const displaySize = { width: video.width, height: video.height };
  faceapi.matchDimensions(canvas, displaySize);


  setInterval(async () => {
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions();
    console.log(detections)
    socket.emit( 'my event', {
      data: detections
    })



    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    faceapi.draw.drawDetections(canvas, resizedDetections);
    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
    faceapi.draw.drawFaceExpressions(canvas, resizedDetections);

    // Check for sadness emotion and make it more visible
    detections.forEach(detection => {
      if (detection.expressions && detection.expressions.sad > 0.5) {
        // Draw a red border around the face for sadness
        const box = detection.detection.box;
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 5;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
      }
    });

    console.log(detections);
  }, 100);
});

// Listen for translations from server
socket.on('translations', (data) => {
  console.log('Received translations:', data);
  document.getElementById('original-text').textContent = data.original || '';
  document.getElementById('hindi-text').textContent = data.hindi || '';
  document.getElementById('english-text').textContent = data.english || '';

  // Update detected language
  const langElement = document.getElementById('detected-lang');
  if (langElement && data.detected_lang) {
    const langNames = {
      'en': 'English',
      'hi': 'Hindi',
      'es': 'Spanish',
      'unknown': 'Unknown',
      'error': 'Error'
    };
    langElement.textContent = langNames[data.detected_lang] || data.detected_lang;
  }

  // Update status
  const voiceStatus = document.getElementById('voice-status');
  if (voiceStatus) {
    if (data.original && data.original !== 'Audio processing failed' && data.original !== 'No speech detected') {
      voiceStatus.textContent = "Translation complete! Click to record again.";
    } else {
      voiceStatus.textContent = "No speech detected. Try again.";
    }
  }

  // Re-enable button
  const startVoiceBtn = document.getElementById('start-voice-btn');
  if (startVoiceBtn) {
    startVoiceBtn.disabled = false;
    startVoiceBtn.textContent = "Start Recording (3s)";
  }
});
