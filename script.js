
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const voiceBtn = document.getElementById("voiceBtn");
const messages = document.getElementById("messages");
const voiceStatus = document.getElementById("voiceStatus");

const API_URL =
  "https://jarvis-ai-backend.darlaniteesh86.workers.dev";

const STORAGE_KEY = "jarvis_conversation_v1";
const VOICE_KEY = "jarvis_voice_enabled";
const MAX_HISTORY = 20;

let history = [];
let voiceOn = localStorage.getItem(VOICE_KEY) !== "false";
let recognition = null;
let isListening = false;

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
  voiceBtn.textContent = voiceOn
    ? "🔊 Voice ON"
    : "🔇 Voice OFF";
}

updateVoiceButton();

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
  addMessage(
    item.text,
    item.role === "user" ? "YOU" : "JARVIS"
  );
});

function saveHistory() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(history)
    );
  } catch (error) {
    console.error("Memory save failed:", error);
  }
}

function speak(text) {
  if (!voiceOn || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
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
    voiceStatus.textContent = "Listening...";
  };

  recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    voiceStatus.textContent = "Voice captured. Tap send.";
  };

  recognition.onerror = event => {
    voiceStatus.textContent =
      "Microphone error: " + event.error;
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.textContent = "🎙";
  };
} else {
  micBtn.disabled = true;
  voiceStatus.textContent =
    "Voice input is not supported by this browser.";
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
    voiceStatus.textContent =
      "Please try the microphone again.";
  }
});

async function sendMessage() {
  const text = input.value.trim();

  if (!text || sendBtn.disabled) return;

  if (isListening && recognition) {
    recognition.stop();
  }

  addMessage(text, "YOU");
  input.value = "";
  sendBtn.disabled = true;

  const thinking = addMessage("Thinking...", "JARVIS");

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

    thinking.textContent = "JARVIS: " + data.reply;

    history = [
      ...updatedHistory,
      { role: "model", text: data.reply }
    ].slice(-MAX_HISTORY);

    saveHistory();
    speak(data.reply);

  } catch (error) {
    thinking.textContent = "JARVIS: " + error.message;
  }

  sendBtn.disabled = false;
  input.focus();
  messages.scrollTop = messages.scrollHeight;
}

sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    sendMessage();
  }
});
