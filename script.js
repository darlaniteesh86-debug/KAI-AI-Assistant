
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const voiceBtn = document.getElementById("voiceBtn");
const messages = document.getElementById("messages");
const voiceStatus = document.getElementById("voiceStatus");

const API_URL = "https://jarvis-ai-backend.darlaniteesh86.workers.dev";
const VOICE_KEY = "jarvis_voice_enabled";
const MAX_HISTORY = 20;

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
let recognitionStarting = false;
let manualMicMode = false;

let speechQueue = [];
let speechToken = 0;
let currentChunk = "";
let currentCharIndex = 0;
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
  currentCharIndex = 0;
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
    startWakeListening();
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

// WAKE WORD LISTENING

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

function scheduleWakeRestart(delay = 1000) {
  if (!wakeEnabled || document.hidden || !recognition) return;

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    startWakeListening();
  }, delay);
}

function startWakeListening() {
  if (
    !recognition ||
    !wakeEnabled ||
    document.hidden ||
    isListening ||
    recognitionStarting
  ) {
    return;
  }

  if (activeController || isSpeaking) {
    scheduleWakeRestart(1200);
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  try {
    recognitionStarting = true;
    recognition.start();
  } catch (error) {
    recognitionStarting = false;
    scheduleWakeRestart(1500);
  }
}

function processWakeTranscript(transcript) {
  const spokenText = transcript.trim();
  if (!spokenText) return;

  const wakePattern = /\bjarvis\b/i;

  if (!wakeArmed) {
    if (!wakePattern.test(spokenText)) return;

    const command = spokenText.replace(wakePattern, "").trim();

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

function createWakeRecognition() {
  if (!SpeechRecognition) return null;

  const instance = new SpeechRecognition();
  instance.lang = "en-IN";
  instance.continuous = false;
  instance.interimResults = false;
  instance.maxAlternatives = 1;

  instance.onstart = () => {
    if (recognition !== instance) return;
    recognitionStarting = false;
    isListening = true;
    micBtn.textContent = "🔴";
    voiceStatus.textContent = wakeArmed
      ? "WAITING FOR YOUR QUESTION..."
      : "SAY JARVIS TO TALK.";
  };

  instance.onresult = event => {
    if (recognition !== instance || !event.results || !event.results.length) return;

    const result = event.results[event.resultIndex] || event.results[0];
    if (!result || !result.isFinal) return;

    const transcript = result[0].transcript.trim();

    if (manualMicMode) {
      manualMicMode = false;
      if (transcript) {
        input.value = transcript;
        voiceStatus.textContent = "VOICE CAPTURED. TAP SEND.";
      } else {
        voiceStatus.textContent = "NO WORDS DETECTED. TAP MIC TO TRY AGAIN.";
      }
      try { instance.stop(); } catch (_) {}
      return;
    }

    processWakeTranscript(transcript);
    try { instance.stop(); } catch (_) {}
  };

  instance.onerror = event => {
    if (recognition !== instance) return;
    recognitionStarting = false;

    if (event.error === "not-allowed") {
      wakeEnabled = false;
      voiceStatus.textContent = "MICROPHONE PERMISSION DENIED. ALLOW MIC ACCESS.";
    } else if (event.error === "service-not-allowed") {
      wakeEnabled = false;
      voiceStatus.textContent = "VOICE SERVICE NOT ALLOWED.";
    } else if (event.error === "audio-capture") {
      manualMicMode = false;
      voiceStatus.textContent = "MICROPHONE NOT AVAILABLE.";
    } else if (event.error === "network") {
      manualMicMode = false;
      voiceStatus.textContent = "VOICE NETWORK ERROR. CHECK INTERNET AND RETRY.";
    } else if (event.error === "no-speech" && manualMicMode) {
      manualMicMode = false;
      voiceStatus.textContent = "NO SPEECH DETECTED. TAP MIC TO TRY AGAIN.";
    } else if (event.error !== "no-speech" && event.error !== "aborted") {
      voiceStatus.textContent = "VOICE ERROR: " + event.error;
    }
  };

  instance.onend = () => {
    if (recognition !== instance) return;
    isListening = false;
    recognitionStarting = false;
    micBtn.textContent = "🎙";

    // Android Chrome can leave a stopped SpeechRecognition instance unusable.
    // Create a fresh instance for the next listening session.
    recognition = createWakeRecognition();

    if (wakeEnabled) scheduleWakeRestart(900);
  };

  return instance;
}

if (SpeechRecognition) {
  recognition = createWakeRecognition();
} else {
  wakeEnabled = false;
  micBtn.disabled = true;
  voiceStatus.textContent = "VOICE INPUT NOT SUPPORTED.";
}

// SPEECH OUTPUT

function speakNext(token) {
  if (token !== speechToken) return;

  if (!voiceOn || speechQueue.length === 0) {
    currentChunk = "";
    isSpeaking = false;
    updateActivityButton();
    voiceStatus.textContent = "SAY JARVIS TO TALK.";
    scheduleWakeRestart(500);
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

  currentCharIndex = 0;
  utterance.onboundary = event => {
    if (token !== speechToken) return;
    if (typeof event.charIndex === "number") {
      currentCharIndex = Math.max(currentCharIndex, event.charIndex);
    }
  };

  utterance.onend = () => {
    if (token !== speechToken) return;
    currentChunk = "";
    currentCharIndex = 0;
    speakNext(token);
  };

  utterance.onerror = event => {
    if (token !== speechToken) return;
    // Ignore interruptions caused by screen changes; visibility handler
    // keeps the unspoken remainder queued for resume.
    if (event && event.error === "interrupted" && speechPausedForScreen) return;
    currentChunk = "";
    currentCharIndex = 0;
    speakNext(token);
  };

  window.speechSynthesis.speak(utterance);
}

function speak(text) {
  if (!voiceOn || !("speechSynthesis" in window)) {
    isSpeaking = false;
    updateActivityButton();
    scheduleWakeRestart(500);
    return;
  }

  const cleanText = cleanForSpeech(text);
  if (!cleanText) {
    scheduleWakeRestart(500);
    return;
  }

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

// SCREEN VISIBILITY

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (isSpeaking && !speechPausedForScreen) {
      speechPausedForScreen = true;
      speechToken++;

      if (currentChunk) {
        // Resume from the last reported speech boundary instead of replaying
        // the entire sentence after the app returns to the foreground.
        const remainder = currentChunk.slice(currentCharIndex).trim();
        if (remainder) speechQueue.unshift(remainder);
        currentChunk = "";
        currentCharIndex = 0;
      }

      window.speechSynthesis.cancel();
      voiceStatus.textContent = "VOICE PAUSED. WAITING...";
    }

    if (isListening && recognition) {
      recognition.stop();
    }

    return;
  }

  resumeSpeech();
  scheduleWakeRestart(700);
});

window.addEventListener("focus", () => {
  resumeSpeech();
  scheduleWakeRestart(700);
});

window.addEventListener("pageshow", () => {
  resumeSpeech();
  scheduleWakeRestart(700);
});

// APP OPENING COMMANDS

function getAppCommand(text) {
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const appNames = {
    youtube: /\byoutube\b/,
    whatsapp: /\bwhatsapp\b/,
    chrome: /\bchrome\b/
  };

  const openWords = /\b(open|launch|start|go to|take me to)\b/;

  if (!openWords.test(normalized)) return null;

  for (const app in appNames) {
    if (appNames[app].test(normalized)) {
      return app;
    }
  }

  return null;
}

function openAndroidApp(appName) {
  const appLinks = {
    youtube:
      "intent://www.youtube.com/#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=https%3A%2F%2Fwww.youtube.com%2F;end",

    whatsapp:
      "intent://send/#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=https%3A%2F%2Fwww.whatsapp.com%2F;end",

    chrome:
      "intent://www.google.com/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fwww.google.com%2F;end"
  };

  if (!appLinks[appName]) return;

  voiceStatus.textContent = "OPENING " + appName.toUpperCase() + "...";
  window.location.href = appLinks[appName];
}

// MICROPHONE BUTTON

micBtn.addEventListener("click", () => {
  if (!recognition || !SpeechRecognition) {
    voiceStatus.textContent = "VOICE INPUT IS NOT SUPPORTED IN THIS BROWSER.";
    return;
  }

  // Direct tap-to-talk: no wake word is required.
  wakeEnabled = true;
  wakeArmed = false;
  manualMicMode = true;

  if (activeController) stopGeneration();
  if (isSpeaking) cancelSpeech();

  voiceStatus.textContent = "LISTENING... SPEAK YOUR QUESTION NOW.";

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  // If recognition is already active, keep that live session running.
  // Stopping it and restarting asynchronously can lose Android's user-gesture
  // permission to start speech recognition.
  if (isListening) {
    voiceStatus.textContent = "LISTENING... SPEAK YOUR QUESTION NOW.";
    return;
  }

  if (!recognitionStarting) {
    try {
      recognitionStarting = true;
      recognition.start();
    } catch (error) {
      recognitionStarting = false;
      manualMicMode = false;
      voiceStatus.textContent = "COULD NOT START MIC. TAP TO RETRY.";
    }
  }
});

// STOP GENERATION

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
  scheduleWakeRestart(500);
}

// SEND MESSAGE

async function sendMessage() {
  const text = input.value.trim();

  // The send button doubles as Stop only when there is no new message.
  if (!text) {
    if (activeController || isSpeaking) stopGeneration();
    return;
  }

  // A new question replaces the current request or speech instead of being
  // discarded as a Stop command.
  if (activeController || isSpeaking) stopGeneration();

  wakeArmed = false;

  if (isListening && recognition) {
    recognition.stop();
  }

  addMessage(text, "YOU");
  input.value = "";

  const appCommand = getAppCommand(text);

  if (appCommand) {
    addMessage("Opening " + appCommand + "...", "JARVIS");
    openAndroidApp(appCommand);
    return;
  }

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
        scheduleWakeRestart(700);
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

// START LISTENING WHEN APP OPENS

window.addEventListener("load", () => {
  setTimeout(startWakeListening, 1200);
});
    
