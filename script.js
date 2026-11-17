
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const voiceBtn = document.getElementById("voiceBtn");
const messages = document.getElementById("messages");
const voiceStatus = document.getElementById("voiceStatus");

const API_URL = "https://jarvis-ai-backend.darlaniteesh86.workers.dev";

const STORAGE_KEY = "jarvis_conversation_v1";
const VOICE_KEY = "jarvis_voice_enabled";
const MAX_HISTORY = 20;

let history = [];
let voiceOn = localStorage.getItem(VOICE_KEY) !== "false";
let recognition = null;
let isListening = false;
let activeController = null;
let requestNumber = 0;

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (Array.isArray(saved)) {
    history = saved.filter(item =>
      item &&
      ["user", "model"].includes(item.role) &&
      typeof item.text === "string"
    ).slice(-MAX_HISTORY);
  }
} catch (error) {
  history = [];
}

function updateVoiceButton() {
  voiceBtn.textContent = voiceOn ? "🔊 VOICE ON" : "🔇 VOICE OFF";
}

function updateSendButton(isGenerating) {
  sendBtn.textContent = isGenerating ? "■" : "➤";
  sendBtn.setAttribute(
    "aria-label",
    isGenerating ? "Stop generating" : "Send message"
  );
  sendBtn.style.background = isGenerating ? "#651b2a" : "";
  sendBtn.style.borderColor = isGenerating ? "#ff526b" : "";
  sendBtn.style.color = isGenerating ? "#ff7185" : "";
}

updateVoiceButton();
updateSendButton(false);

voiceBtn.addEventListener("click", () => {
  voiceOn = !voiceOn;
  localStorage.setItem(VOICE_KEY, String(voiceOn));

  if (!voiceOn && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
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

history.forEach(item => {
  addMessage(item.text, item.role === "user" ? "YOU" : "JARVIS");
});

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error("Memory save failed:", error);
  }
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

function speak(text) {
  if (!voiceOn || !("speechSynthesis" in window)) return;

  const cleanText = cleanForSpeech(text);
  if (!cleanText) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = "en-IN";
  utterance.rate = 1;
  utterance.pitch = 1;

  window.speechSynthesis.speak(utterance);
}

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    micBtn.textContent = "🔴";
    voiceStatus.textContent = "LISTENING...";
  };

  recognition.onresult = event => {
    input.value = event.results[0][0].transcript;
    voiceStatus.textContent = "VOICE CAPTURED. TAP SEND.";
  };

  recognition.onerror = event => {
    voiceStatus.textContent = "MICROPHONE ERROR: " + event.error;
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.textContent = "🎙";
  };
} else {
  micBtn.disabled = true;
  voiceStatus.textContent = "VOICE INPUT NOT SUPPORTED.";
}

micBtn.addEventListener("click", () => {
  if (!recognition) return;

  if (isListening) {
    recognition.stop();
    return;
  }

  try {
    recognition.start();
  } catch (error) {
    voiceStatus.textContent = "PLEASE TRY AGAIN.";
  }
});

function stopGeneration() {
  if (!activeController) return;

  const controller = activeController;
  activeController = null;
  requestNumber++;

  controller.abort();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  const thinking = document.getElementById("thinkingMessage");
  if (thinking) {
    thinking.textContent = "JARVIS: Response stopped.";
    thinking.removeAttribute("id");
  }

  sendBtn.disabled = false;
  updateSendButton(false);
  voiceStatus.textContent = "GENERATION STOPPED.";
  input.focus();
}

async function sendMessage() {
  if (activeController) {
    stopGeneration();
    return;
  }

  const text = input.value.trim();
  if (!text) return;

  if (isListening && recognition) recognition.stop();

  addMessage(text, "YOU");
  input.value = "";

  sendBtn.disabled = false;

  const thinking = addMessage("Thinking...", "JARVIS");
  thinking.id = "thinkingMessage";

  const controller = new AbortController();
  activeController = controller;

  const thisRequest = ++requestNumber;

  updateSendButton(true);
  voiceStatus.textContent = "JARVIS IS THINKING...";

  const updatedHistory = [
    ...history,
    { role: "user", text: text }
  ];

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    saveHistory();
    speak(data.reply);

    voiceStatus.textContent = "VOICE SYSTEM READY.";

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
      updateSendButton(false);
      sendBtn.disabled = false;
      input.focus();
      messages.scrollTop = messages.scrollHeight;
    }
  }
}

sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keydown", event => {
  if (event.key === "Enter") sendMessage();
});
