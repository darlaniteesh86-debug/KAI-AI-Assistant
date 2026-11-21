
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const voiceBtn = document.getElementById("voiceBtn");
const messages = document.getElementById("messages");
const voiceStatus = document.getElementById("voiceStatus");

const API_URL = "https://jarvis-ai-backend.darlaniteesh86.workers.dev";
const VOICE_KEY = "jarvis_voice_enabled";
const MAX_HISTORY = 20;

const TOKEN_KEY = "jarvis_session_token";
const loginGate = document.getElementById("loginGate");
const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginStatus = document.getElementById("loginStatus");
const logoutBtn = document.getElementById("logoutBtn");
let sessionToken = localStorage.getItem(TOKEN_KEY) || "";

function showLogin(message = "") {
  loginGate.hidden = false;
  loginStatus.textContent = message;
  passwordInput.value = "";
}

function hideLogin() {
  loginGate.hidden = true;
  loginStatus.textContent = "";
}

async function authRequest(action, payload = {}, signal) {
  const headers = { "Content-Type": "application/json" };
  if (sessionToken && action !== "login") {
    headers.Authorization = "Bearer " + sessionToken;
  }
  const result = await fetch(API_URL, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({ action, ...payload })
  });
  const data = await result.json();
  if (!result.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function displaySavedHistory(savedHistory) {
  history = Array.isArray(savedHistory) ? savedHistory : [];
  messages.textContent = "";
  for (const item of history) {
    addMessage(item.text || "", item.role === "assistant" ? "JARVIS" : "YOU");
  }
}

async function initializeSession() {
  showLogin(sessionToken ? "CHECKING YOUR SESSION..." : "");
  if (!sessionToken) {
    showLogin();
    return;
  }
  try {
    const data = await authRequest("history");
    displaySavedHistory(data.history);
    hideLogin();
  } catch (error) {
    sessionToken = "";
    localStorage.removeItem(TOKEN_KEY);
    showLogin("Your session expired. Please log in again.");
  }
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const password = passwordInput.value;
  if (!password) {
    loginStatus.textContent = "Enter your JARVIS password.";
    return;
  }
  const loginButton = document.getElementById("loginBtn");
  loginButton.disabled = true;
  loginStatus.textContent = "AUTHENTICATING...";
  try {
    const data = await authRequest("login", { password });
    sessionToken = data.token;
    localStorage.setItem(TOKEN_KEY, sessionToken);
    const historyData = await authRequest("history");
    displaySavedHistory(historyData.history);
    hideLogin();
  } catch (error) {
    sessionToken = "";
    localStorage.removeItem(TOKEN_KEY);
    loginStatus.textContent = error.message;
  } finally {
    passwordInput.value = "";
    loginButton.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => {
  sessionToken = "";
  localStorage.removeItem(TOKEN_KEY);
  history = [];
  messages.textContent = "";
  showLogin("You have logged out.");
});

initializeSession();

let history = [];
let voiceOn = localStorage.getItem(VOICE_KEY) !== "false";
let recognition = null;
let isListening = false;
let isSpeaking = false;
let activeController = null;
let requestNumber = 0;

let recognitionStarting = false;
let manualMicMode = false;

let speechQueue = [];
let speechToken = 0;
let currentChunk = "";
let currentCharIndex = 0;
let speechPausedForScreen = false;
let resumeTimer = null;

function unlockSpeechOutput() {
  if (!("speechSynthesis" in window)) return;

  try {
    const silentUnlock = new SpeechSynthesisUtterance("ready");
    silentUnlock.lang = "en-IN";
    silentUnlock.volume = 0;
    silentUnlock.rate = 10;
    window.speechSynthesis.speak(silentUnlock);
    window.speechSynthesis.resume();
  } catch (error) {
    console.warn("Speech output could not be initialized:", error);
  }
}

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
  unlockSpeechOutput();
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

// TAP-TO-TALK MICROPHONE INPUT

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

function createRecognition() {
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
    voiceStatus.textContent = "LISTENING... SPEAK YOUR QUESTION NOW.";
  };

  instance.onresult = event => {
    if (recognition !== instance || !event.results || !event.results.length) return;
    const result = event.results[event.resultIndex] || event.results[0];
    if (!result || !result.isFinal) return;

    const transcript = result[0].transcript.trim();
    manualMicMode = false;
    if (transcript) {
      input.value = transcript;
      voiceStatus.textContent = "VOICE CAPTURED. TAP SEND.";
    } else {
      voiceStatus.textContent = "NO WORDS DETECTED. TAP MIC TO TRY AGAIN.";
    }
    try { instance.stop(); } catch (_) {}
  };

  instance.onerror = event => {
    if (recognition !== instance) return;
    recognitionStarting = false;
    manualMicMode = false;

    if (event.error === "not-allowed") {
      voiceStatus.textContent = "MICROPHONE PERMISSION DENIED. ALLOW MIC ACCESS.";
    } else if (event.error === "service-not-allowed") {
      voiceStatus.textContent = "VOICE SERVICE NOT ALLOWED.";
    } else if (event.error === "audio-capture") {
      voiceStatus.textContent = "MICROPHONE NOT AVAILABLE.";
    } else if (event.error === "network") {
      voiceStatus.textContent = "VOICE NETWORK ERROR. CHECK INTERNET AND RETRY.";
    } else if (event.error === "no-speech") {
      voiceStatus.textContent = "NO SPEECH DETECTED. TAP MIC TO TRY AGAIN.";
    } else if (event.error !== "aborted") {
      voiceStatus.textContent = "VOICE ERROR: " + event.error;
    }
  };

  instance.onend = () => {
    if (recognition !== instance) return;
    isListening = false;
    recognitionStarting = false;
    manualMicMode = false;
    micBtn.textContent = "🎙";
    recognition = createRecognition();
    if (voiceStatus.textContent === "LISTENING... SPEAK YOUR QUESTION NOW.") {
      voiceStatus.textContent = "NO WORDS DETECTED. TAP MIC TO TRY AGAIN.";
    }
  };

  return instance;
}

if (SpeechRecognition) {
  recognition = createRecognition();
} else {
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
    voiceStatus.textContent = "READY. TAP MIC TO SPEAK.";
    return;
  }

  if (document.hidden) {
    speechPausedForScreen = true;
    return;
  }

  currentChunk = speechQueue.shift();

  const utterance = new SpeechSynthesisUtterance(currentChunk);
  utterance.lang = "en-IN";
  utterance.volume = 1;
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

  try {
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.error("Speech playback failed:", error);
    isSpeaking = false;
    updateActivityButton();
    voiceStatus.textContent = "VOICE PLAYBACK FAILED. TAP VOICE ON TO RETRY.";
  }
}

function speak(text) {
  if (!voiceOn || !("speechSynthesis" in window)) {
    isSpeaking = false;
    updateActivityButton();
    return;
  }

  const cleanText = cleanForSpeech(text);
  if (!cleanText) {
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
});

window.addEventListener("focus", () => {
  resumeSpeech();
});

window.addEventListener("pageshow", () => {
  resumeSpeech();
});

// LOCAL DEVICE INFORMATION

function getLocalInfoAnswer(text) {
  const normalized = text.toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();
  const asksTime = /\b(what time is it|current time|tell me the time|time now|what is the time)\b/.test(normalized);
  const asksDate = /\b(what is the date|what date is it|today'?s date|current date|today date)\b/.test(normalized);

  if (!asksTime && !asksDate) return null;

  const now = new Date();
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit"
  }).format(now);
  const date = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(now);

  if (asksTime && asksDate) return "The current time is " + time + ". Today is " + date + ".";
  if (asksDate) return "Today is " + date + ".";
  return "The current time is " + time + ".";
}

// APP OPENING COMMANDS

function getAppCapabilityAnswer(text) {
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const asksCapability =
    /\b(can|could|are|would) you (open|launch|start)\b/.test(normalized) ||
    /\b(are you able to|do you have the ability to) (open|launch|start)\b/.test(normalized);

  if (!asksCapability) return null;

  const appNames = {
    youtube: /\byoutube\b/,
    whatsapp: /\bwhatsapp\b/,
    chrome: /\bchrome\b/
  };

  for (const app in appNames) {
    if (appNames[app].test(normalized)) {
      return "Yes. I can open " + app + " when you tell me to open it.";
    }
  }

  return null;
}

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
    youtube: {
      url: "intent://www.youtube.com/#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=https%3A%2F%2Fwww.youtube.com%2F;end",
      fallback: "https://www.youtube.com/"
    },
    whatsapp: {
      url: "intent://send/#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=https%3A%2F%2Fwww.whatsapp.com%2F;end",
      fallback: "https://www.whatsapp.com/"
    },
    chrome: {
      url: "intent://www.google.com/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fwww.google.com%2F;end",
      fallback: "https://www.google.com/"
    }
  };

  const app = appLinks[appName];
  if (!app) return;

  voiceStatus.textContent = "OPENING " + appName.toUpperCase() + "...";

  // Use a real link activation so Android can handle the external app intent
  // from the user's Send-button gesture, including when JARVIS is installed as a PWA.
  const launchLink = document.createElement("a");
  launchLink.href = app.url;
  launchLink.target = "_self";
  launchLink.rel = "noopener";
  launchLink.style.display = "none";
  document.body.appendChild(launchLink);
  launchLink.click();
  launchLink.remove();

  // Do not silently redirect to a website: report the requested app launch.
  // If Android cannot resolve the intent, the user can tell us which app is installed.
}

// MICROPHONE BUTTON

micBtn.addEventListener("click", () => {
  if (!recognition || !SpeechRecognition) {
    voiceStatus.textContent = "VOICE INPUT IS NOT SUPPORTED IN THIS BROWSER.";
    return;
  }

  // A direct tap is also a user gesture that can initialize Android speech output.
  unlockSpeechOutput();

  // Direct tap-to-talk: no wake word is required.
  manualMicMode = true;

  if (activeController) stopGeneration();
  if (isSpeaking) cancelSpeech();

  voiceStatus.textContent = "LISTENING... SPEAK YOUR QUESTION NOW.";

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
}

// SEND MESSAGE

async function sendMessage() {
  unlockSpeechOutput();
  const text = input.value.trim();

  // The send button doubles as Stop only when there is no new message.
  if (!text) {
    if (activeController || isSpeaking) stopGeneration();
    return;
  }

  // A new question replaces the current request or speech instead of being
  // discarded as a Stop command.
  if (activeController || isSpeaking) stopGeneration();


  if (isListening && recognition) {
    recognition.stop();
  }

  addMessage(text, "YOU");
  input.value = "";

  const localInfo = getLocalInfoAnswer(text);
  if (localInfo) {
    addMessage(localInfo, "JARVIS");
    if (voiceOn) speak(localInfo);
    voiceStatus.textContent = "LOCAL DEVICE INFORMATION.";
      return;
  }

  const appCapabilityAnswer = getAppCapabilityAnswer(text);
  if (appCapabilityAnswer) {
    addMessage(appCapabilityAnswer, "JARVIS");
    if (voiceOn) speak(appCapabilityAnswer);
    voiceStatus.textContent = "READY.";
    return;
  }

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

  try {
    const data = await authRequest("chat", { message: text }, controller.signal);

    if (!data.reply) {
      throw new Error("No reply received from JARVIS");
    }

    if (thisRequest !== requestNumber) return;

    thinking.textContent = "JARVIS: " + data.reply;
    thinking.removeAttribute("id");
    history = Array.isArray(data.history) ? data.history : history;

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

// Voice input is inactive until the microphone button is tapped.
    
