
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const messages = document.getElementById("messages");

const API_URL =
  "https://jarvis-ai-backend.darlaniteesh86.workers.dev";

const STORAGE_KEY = "jarvis_conversation_v1";
const MAX_HISTORY = 20;

let history = [];

// Load saved conversation
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

// Display a message
function addMessage(text, sender) {
  const message = document.createElement("div");

  message.className = "message";
  message.style.marginBottom = "12px";
  message.textContent = sender + ": " + text;

  messages.appendChild(message);
  messages.scrollTop = messages.scrollHeight;

  return message;
}

// Display previous conversation
history.forEach(item => {
  addMessage(
    item.text,
    item.role === "user" ? "YOU" : "JARVIS"
  );
});

// Save conversation
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

// Send message to Gemini
async function sendMessage() {
  const text = input.value.trim();

  if (!text || sendBtn.disabled) return;

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

  } catch (error) {
    thinking.textContent =
      "JARVIS: " + error.message;
  }

  sendBtn.disabled = false;
  input.focus();
  messages.scrollTop = messages.scrollHeight;
}

// Button interaction
sendBtn.addEventListener("click", sendMessage);

// Enter key interaction
input.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    sendMessage();
  }
});
