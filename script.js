
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const voiceBtn = document.getElementById("voiceBtn");
const messages = document.getElementById("messages");
const voiceStatus = document.getElementById("voiceStatus");

const API_URL = "https://jarvis-ai-backend.darlaniteesh86.workers.dev";
const VOICE_KEY = "jarvis_voice_enabled";
const MAX_HISTORY = 20;
const WAKE_WORD = "jarvis";

let history = [];
let voiceOn = localStorage.getItem(VOICE_KEY) !== "false";
let recognition = null;
let isListening = false;
let isSpeaking = false;
let activeController = null;
let requestNumber = 0;

let wakeEnabled = true;
let wakeArmed = false;
let restartTimer = null;

let speechQueue = [];
let speechToken = 0;
let currentChunk = "";
let speechPausedForScreen = false;
let resumeTimer = null;

function updateVoiceButton() {
  voiceBtn.textContent = voiceOn ? "🔊 VOICE ON" : "🔇 VOICE OFF";
}

function updateSendButton(active) {
  sendBtn.textContent = active ? "■" : "➤";
  sendBtn.setAttribute("aria-label", active ? "Stop JARVIS" : "Send message");
  sendBtn.style.background = active ? "#651b2a" : "";
  sendBtn.style.borderColor = active ? "#ff526b" : "";
  sendBtn.style.color = active ? "#ff7185" : "";
}

function updateActivityButton() {
  updateSendButton(Boolean(activeController || isSpeaking));
}

function cancelSpeech() {
  speechToken++;
  speechQueue = [];
  currentChunk = "";
  speechPausedForScreen = false;

  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  isSpeaking = false;
  updateActivityButton();
}

updateVoiceButton();
updateActivityButton();

voiceBtn.addEventListener("click", () => {
  voiceOn = !voiceOn;
  localStorage.setItem(VOICE_KEY, String(voiceOn));

  if (!voiceOn) {
    cancelSpeech();
    voiceStatus.textContent = "VOICE SYSTEM OFF.";
  } else {
    voiceStatus.textContent = "VOICE SYSTEM READY.";
  }

  updateVoiceButton();
});

function addMessage(text, sender) {
  const message = document.createElement("div");
  message.className = "message";
  message.style.marginBottom = "12px";
  message.textContent = sender + ": " + text;
  messages.appendChild(message);
  messages.scrollTop = messages.scrollHeight;
  return message;
}

function cleanForSpeech(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, " Code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*＊]/g, "")
    .replace(/[_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSpeech(text, maxLength = 80) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const part = sentence.trim();
    if (!part) continue;

    if ((current + " " + part).trim().length <= maxLength) {
      current = (current + " " + part).trim();
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    const words = part.split(/\s+/);

    for (const word of words) {
      if ((current + " " + word).trim().length > maxLength) {
        if (current) chunks.push(current);
        current = word;
      } else {
        current = (current + " " + word).trim();
      }
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

function speakNext(token) {
  if (token !== speechToken) return;

  if (!voiceOn || speechQueue.length === 0) {
    currentChunk = "";
    isSpeaking = false;
    updateActivityButton();
    voiceStatus.textContent = "SAY JARVIS TO TALK.";
    startWakeListening();
    return;
  }

  if (document.hidden) {
    speechPausedForScreen = true;
    return;
  }

  currentChunk = speechQueue.shift();

  const utterance = new SpeechSynthesisUtterance(currentChunk);
  utterance.lang = "en-IN";
  utterance.rate = 1;
  utterance.pitch = 1;

  utterance.onend = () => {
    if (token !== speechToken) return;
    currentChunk = "";
    speakNext(token);
  };

  utterance.onerror = () => {
    if (token !== speechToken) return;
    currentChunk = "";
    speakNext(token);
  };

  window.speechSynthesis.speak(utterance);
}

function speak(text) {
  if (!voiceOn || !("speechSynthesis" in window)) return;

  const cleanText = cleanForSpeech(text);
  if (!cleanText) return;

  cancelSpeech();
  speechQueue = splitSpeech(cleanText);

  const token = speechToken;

  isSpeaking = true;
  updateActivityButton();
  voiceStatus.textContent = "JARVIS IS SPEAKING...";

  speakNext(token);
}

function resumeSpeech() {
  if (
    !speechPausedForScreen ||
    !isSpeaking ||
    !voiceOn ||
    speechQueue.length === 0 ||
    document.hidden
  ) {
    return;
  }

  speechPausedForScreen = false;

  if (resumeTimer) clearTimeout(resumeTimer);

  voiceStatus.textContent = "RESUMING JARVIS VOICE...";

  resumeTimer = setTimeout(() => {
    resumeTimer = null;

    if (
      isSpeaking &&
      voiceOn &&
      !document.hidden &&
      speechQueue.length > 0
    ) {
      speakNext(speechToken);
    }
  }, 700);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (isSpeaking && !speechPausedForScreen) {
      speechPausedForScreen = true;
      speechToken++;

      if (currentChunk) {
        speechQueue.unshift(currentChunk);
        currentChunk = "";
      }

      window.speechSynthesis.cancel();
      voiceStatus.textContent = "VOICE PAUSED. WAITING...";
    }

    return;
  }

  resumeSpeech();
  startWakeListening();
});

window.addEventListener("focus", resumeSpeech);
window.addEventListener("pageshow", resumeSpeech);

// WAKE WORD VOICE RECOGNITION

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

function startWakeListening() {
  if (
    !recognition ||
    !wakeEnabled ||
    isListening ||
    activeController ||
    isSpeaking ||
    document.hidden
  ) {
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  try {
    recognition.start();
  } catch (error) {
    // Recognition may already be starting.
  }
}

function scheduleWakeRestart() {
  if (!wakeEnabled || document.hidden) return;

  if (restartTimer) clearTimeout(restartTimer);

  restartTimer = setTimeout(() => {
    restartTimer = null;
    startWakeListening();
  }, 1000);
}

function processWakeTranscript(transcript) {
  const spokenText = transcript.trim();
  if (!spokenText) return;

  const wakePattern = /\bjarvis\b/i;

  if (!wakeArmed) {
    if (!wakePattern.test(spokenText)) return;

    const command = spokenText
      .replace(wakePattern, "")
      .trim();

    wakeArmed = true;

    if (command) {
      input.value = command;
      voiceStatus.textContent = "QUESTION DETECTED...";
      recognition.stop();
      sendMessage();
    } else {
      voiceStatus.textContent = "YES? I'M LISTENING...";
    }

    return;
  }

  input.value = spokenText.replace(wakePattern, "").trim();

  if (!input.value) return;

  wakeArmed = false;
  voiceStatus.textContent = "QUESTION DETECTED...";

  recognition.stop();
  sendMessage();
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();

  recognition.lang = "en-IN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => {
    isListening = true;
    micBtn.textContent = "🔴";
    voiceStatus.textContent = wakeArmed
      ? "WAITING FOR YOUR QUESTION..."
      : "SAY JARVIS TO TALK.";
  };

  recognition.onresult = event => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.trim();

      if (event.results[i].isFinal) {
        processWakeTranscript(transcript);
      }
    }
  };

  recognition.onerror = event => {
    if (event.error === "not-allowed") {
      wakeEnabled = false;
      voiceStatus.textContent = "MICROPHONE PERMISSION DENIED.";
    } else if (event.error === "service-not-allowed") {
      wakeEnabled = false;
      voiceStatus.textContent = "VOICE SERVICE NOT ALLOWED.";
    } else if (event.error !== "no-speech" &&
               event.error !== "aborted") {
      voiceStatus.textContent = "VOICE ERROR: " + event.error;
    }
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.textContent = "🎙";

    if (wakeEnabled && !activeController && !isSpeaking) {
      scheduleWakeRestart();
    }
  };

} else {
  wakeEnabled = false;
  micBtn.disabled = true;
  voiceStatus.textContent = "VOICE INPUT NOT SUPPORTED.";
}

// Microphone button toggles wake-word listening.

micBtn.addEventListener("click", () => {
  if (!recognition) return;

  if (wakeEnabled) {
    wakeEnabled = false;
    wakeArmed = false;

    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }

    if (isListening) recognition.stop();

    voiceStatus.textContent = "WAKE WORD LISTENING OFF.";
    micBtn.textContent = "🎙";
  } else {
    wakeEnabled = true;
    wakeArmed = false;
    voiceStatus.textContent = "STARTING WAKE WORD...";
    startWakeListening();
  }
});

function stopGeneration() {
  if (!activeController && !isSpeaking) return;

  requestNumber++;

  if (activeController) {
    activeController.abort();
    activeController = null;
  }

  cancelSpeech();

  const thinking = document.getElementById("thinkingMessage");

  if (thinking) {
    thinking.textContent = "JARVIS: Response stopped.";
    thinking.removeAttribute("id");
  }

  updateActivityButton();
  voiceStatus.textContent = "GENERATION STOPPED.";
  input.focus();
  startWakeListening();
}

async function sendMessage() {
  if (activeController || isSpeaking) {
    stopGeneration();
    return;
  }

  const text = input.value.trim();
  if (!text) return;

  wakeArmed = false;

  if (isListening && recognition) {
    recognition.stop();
  }

  addMessage(text, "YOU");
  input.value = "";

  const thinking = addMessage("Thinking...", "JARVIS");
  thinking.id = "thinkingMessage";

  const controller = new AbortController();
  activeController = controller;

  const thisRequest = ++requestNumber;

  updateActivityButton();
  voiceStatus.textContent = "JARVIS IS THINKING...";

  const updatedHistory = [
    ...history,
    { role: "user", text: text }
  ];

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        messages: updatedHistory.slice(-MAX_HISTORY).map(item => ({
          role: item.role,
          text: item.text
        }))
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "AI request failed");
    }

    if (!data.reply) {
      throw new Error("No reply received from JARVIS");
    }

    if (thisRequest !== requestNumber) return;

    thinking.textContent = "JARVIS: " + data.reply;
    thinking.removeAttribute("id");

    history = [
      ...updatedHistory,
      { role: "model", text: data.reply }
    ].slice(-MAX_HISTORY);

    if (voiceOn) {
      speak(data.reply);
    }

  } catch (error) {
    if (error.name === "AbortError") return;

    if (thisRequest === requestNumber) {
      thinking.textContent = "JARVIS: " + error.message;
      thinking.removeAttribute("id");
      voiceStatus.textContent = "REQUEST FAILED.";
    }

  } finally {
    if (thisRequest === requestNumber) {
      activeController = null;
      updateActivityButton();
      input.focus();
      messages.scrollTop = messages.scrollHeight;

      if (!isSpeaking) {
        startWakeListening();
      }
    }
  }
}

sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

// Start listening when the app opens.

window.addEventListener("load", () => {
  setTimeout(startWakeListening, 1200);
});
